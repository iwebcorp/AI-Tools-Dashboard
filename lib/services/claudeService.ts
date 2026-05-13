import 'server-only';

import { z } from 'zod';
import { ANTHROPIC_PRICING, estimateCost, getPrice } from '@/lib/pricing';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage, monthRange } from './shared';

const CacheCreationSchema = z
  .object({
    ephemeral_1h_input_tokens: z.number().optional(),
    ephemeral_5m_input_tokens: z.number().optional(),
  })
  .optional();

const UsageResultSchema = z
  .object({
    model: z.string().nullable().optional(),
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    uncached_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    cache_creation: CacheCreationSchema,
    num_model_requests: z.number().optional(),
  })
  .passthrough();

const UsageBucketSchema = z
  .object({
    starting_at: z.string(),
    ending_at: z.string().optional(),
    results: z.array(UsageResultSchema),
  })
  .passthrough();

const UsagePageSchema = z
  .object({
    data: z.array(UsageBucketSchema),
    has_more: z.boolean(),
    next_page: z.string().nullable(),
  })
  .passthrough();

const CostResultSchema = z
  .object({
    currency: z.string().optional(),
    amount: z.string(),
    model: z.string().nullable().optional(),
    description: z.string().optional(),
  })
  .passthrough();

const CostBucketSchema = z
  .object({
    starting_at: z.string(),
    ending_at: z.string().optional(),
    results: z.array(CostResultSchema),
  })
  .passthrough();

const CostPageSchema = z
  .object({
    data: z.array(CostBucketSchema),
    has_more: z.boolean(),
    next_page: z.string().nullable(),
  })
  .passthrough();

type UsageBucket = z.infer<typeof UsageBucketSchema>;
type CostBucket = z.infer<typeof CostBucketSchema>;

function authHeaders(apiKey: string) {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'User-Agent': 'ai-dashboard/0.1',
  };
}

function inputTokensFor(result: z.infer<typeof UsageResultSchema>): number {
  if (typeof result.input_tokens === 'number') return result.input_tokens;

  const cacheCreation =
    typeof result.cache_creation_input_tokens === 'number'
      ? result.cache_creation_input_tokens
      : (result.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
        (result.cache_creation?.ephemeral_5m_input_tokens ?? 0);

  return (result.uncached_input_tokens ?? 0) + (result.cache_read_input_tokens ?? 0) + cacheCreation;
}

async function fetchUsageBuckets(apiKey: string, start: Date, end: Date): Promise<UsageBucket[] | ServiceUsage> {
  const params = new URLSearchParams({
    starting_at: start.toISOString(),
    ending_at: end.toISOString(),
    bucket_width: '1d',
    limit: '31',
  });
  params.append('group_by[]', 'model');

  const buckets: UsageBucket[] = [];
  let page: string | null = null;

  do {
    if (page) params.set('page', page);
    const response = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${params.toString()}`,
      {
        headers: authHeaders(apiKey),
        cache: 'no-store',
      }
    );

    if (response.status === 401 || response.status === 403) {
      return emptyUsage(
        'claude',
        'INVALID_KEY',
        'Anthropic 조직 Admin API 키 또는 권한을 확인하세요. 개인 계정 키로는 Usage API를 사용할 수 없습니다.'
      );
    }
    if (response.status === 404) {
      return emptyUsage('claude', 'NO_USAGE_API', 'Anthropic Usage & Cost Admin API를 사용할 수 없는 계정입니다.');
    }
    if (!response.ok) {
      return emptyUsage('claude', 'UNKNOWN', `Claude Usage API error: ${response.status}`);
    }

    const parsed = UsagePageSchema.safeParse(await response.json());
    if (!parsed.success) {
      return emptyUsage('claude', 'SCHEMA_CHANGED', 'Claude Usage API 응답 구조가 변경되었습니다.');
    }

    buckets.push(...parsed.data.data);
    page = parsed.data.has_more ? parsed.data.next_page : null;
  } while (page);

  return buckets;
}

async function fetchCostBuckets(apiKey: string, start: Date, end: Date): Promise<CostBucket[] | null> {
  const params = new URLSearchParams({
    starting_at: start.toISOString(),
    ending_at: end.toISOString(),
    limit: '31',
  });
  params.append('group_by[]', 'description');

  const buckets: CostBucket[] = [];
  let page: string | null = null;

  do {
    if (page) params.set('page', page);
    const response = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`, {
      headers: authHeaders(apiKey),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const parsed = CostPageSchema.safeParse(await response.json());
    if (!parsed.success) return null;

    buckets.push(...parsed.data.data);
    page = parsed.data.has_more ? parsed.data.next_page : null;
  } while (page);

  return buckets;
}

function addModelUsage(
  modelMap: Map<string, ModelUsage>,
  model: string,
  inputTokens: number,
  outputTokens: number,
  requests: number,
  cost: number
) {
  const current = modelMap.get(model) ?? {
    model,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    requests: 0,
  };
  current.inputTokens += inputTokens;
  current.outputTokens += outputTokens;
  current.requests += requests;
  current.cost += cost;
  modelMap.set(model, current);
}

export async function fetchClaudeUsage(): Promise<ServiceUsage> {
  const apiKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!apiKey) {
    return emptyUsage('claude', 'NOT_CONFIGURED', 'ANTHROPIC_ADMIN_KEY가 설정되지 않았습니다.');
  }

  try {
    const { start, end } = monthRange();
    const usageResult = await fetchUsageBuckets(apiKey, start, end);
    if (!Array.isArray(usageResult)) return usageResult;

    const costBuckets = await fetchCostBuckets(apiKey, start, end);
    const modelMap = new Map<string, ModelUsage>();
    const dailyMap = new Map<string, DailyUsage>();
    let input = 0;
    let output = 0;
    let requests = 0;

    for (const bucket of usageResult) {
      const date = bucket.starting_at.slice(0, 10);
      const daily = dailyMap.get(date) ?? {
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        cost: 0,
      };

      for (const result of bucket.results) {
        const model = result.model ?? 'unknown';
        const inputTokens = inputTokensFor(result);
        const outputTokens = result.output_tokens ?? 0;
        const modelRequests = result.num_model_requests ?? 0;
        const estimatedCost = estimateCost(getPrice(ANTHROPIC_PRICING, model), inputTokens, outputTokens);

        addModelUsage(modelMap, model, inputTokens, outputTokens, modelRequests, estimatedCost);
        daily.inputTokens += inputTokens;
        daily.outputTokens += outputTokens;
        daily.requests += modelRequests;
        daily.cost += estimatedCost;
        input += inputTokens;
        output += outputTokens;
        requests += modelRequests;
      }

      dailyMap.set(date, daily);
    }

    if (costBuckets) {
      const modelCosts = new Map<string, number>();
      const dailyCosts = new Map<string, number>();

      for (const bucket of costBuckets) {
        const date = bucket.starting_at.slice(0, 10);
        for (const result of bucket.results) {
          const amount = Number.parseFloat(result.amount);
          if (!Number.isFinite(amount)) continue;
          dailyCosts.set(date, (dailyCosts.get(date) ?? 0) + amount);
          if (result.model) {
            modelCosts.set(result.model, (modelCosts.get(result.model) ?? 0) + amount);
          }
        }
      }

      for (const [date, cost] of dailyCosts) {
        const daily = dailyMap.get(date) ?? {
          date,
          inputTokens: 0,
          outputTokens: 0,
          requests: 0,
          cost: 0,
        };
        daily.cost = cost;
        dailyMap.set(date, daily);
      }

      if (modelCosts.size > 0) {
        for (const model of modelMap.keys()) {
          const current = modelMap.get(model);
          if (current) current.cost = modelCosts.get(model) ?? 0;
        }
      }
    }

    const models = [...modelMap.values()].sort((a, b) => b.cost - a.cost);
    const dailyHistory = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const thisMonth = dailyHistory.reduce((sum, item) => sum + item.cost, 0);
    const today = dailyHistory.find((entry) => entry.date === new Date().toISOString().slice(0, 10))?.cost ?? 0;

    return {
      service: 'claude',
      connected: true,
      cost: { today, thisMonth },
      tokens: { input, output, total: input + output },
      requests,
      models,
      dailyHistory,
    };
  } catch (error) {
    console.error('[Claude] Usage fetch failed:', error);
    return emptyUsage('claude', 'UNKNOWN', 'Claude 사용량 조회 중 알 수 없는 오류가 발생했습니다.');
  }
}
