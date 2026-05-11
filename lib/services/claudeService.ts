import 'server-only';

import { z } from 'zod';
import { ANTHROPIC_PRICING, estimateCost, getPrice } from '@/lib/pricing';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage, monthRange } from './shared';

const UsageResultSchema = z
  .object({
    model: z.string().nullable().optional(),
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    uncached_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    num_model_requests: z.number().optional(),
  })
  .passthrough();

const UsageBucketSchema = z
  .object({
    starting_at: z.string().optional(),
    ending_at: z.string().optional(),
    results: z.array(UsageResultSchema).optional(),
  })
  .passthrough();

const UsagePageSchema = z
  .object({
    data: z.array(UsageBucketSchema),
    has_more: z.boolean().optional(),
    next_page: z.string().nullable().optional(),
  })
  .passthrough();

export async function fetchClaudeUsage(): Promise<ServiceUsage> {
  const apiKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!apiKey) {
    return emptyUsage('claude', 'NOT_CONFIGURED', 'ANTHROPIC_ADMIN_KEY가 설정되지 않았습니다.');
  }

  try {
    const { start, end } = monthRange();
    const params = new URLSearchParams({
      starting_at: start.toISOString(),
      ending_at: end.toISOString(),
      bucket_width: '1d',
    });
    params.append('group_by[]', 'model');

    const buckets: z.infer<typeof UsageBucketSchema>[] = [];
    let page: string | null | undefined;

    do {
      if (page) params.set('page', page);
      const response = await fetch(
        `https://api.anthropic.com/v1/organizations/usage_report/messages?${params.toString()}`,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          cache: 'no-store',
        }
      );

      if (response.status === 401 || response.status === 403) {
        return emptyUsage('claude', 'INVALID_KEY', 'Anthropic 조직 Admin API 키 권한을 확인하세요.');
      }
      if (!response.ok) {
        return emptyUsage('claude', 'UNKNOWN', `Claude Usage API 오류: ${response.status}`);
      }

      const parsed = UsagePageSchema.safeParse(await response.json());
      if (!parsed.success) {
        return emptyUsage('claude', 'SCHEMA_CHANGED', 'Claude Usage API 응답 구조가 변경되었습니다.');
      }
      buckets.push(...parsed.data.data);
      page = parsed.data.has_more ? parsed.data.next_page : null;
    } while (page);

    const modelMap = new Map<string, ModelUsage>();
    const dailyMap = new Map<string, DailyUsage>();
    let input = 0;
    let output = 0;
    let requests = 0;

    for (const bucket of buckets) {
      const date = (bucket.starting_at ?? new Date().toISOString()).slice(0, 10);
      const daily = dailyMap.get(date) ?? {
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        cost: 0,
      };

      for (const result of bucket.results ?? []) {
        const model = result.model ?? 'unknown';
        const inputTokens =
          result.input_tokens ??
          (result.uncached_input_tokens ?? 0) +
            (result.cache_read_input_tokens ?? 0) +
            (result.cache_creation_input_tokens ?? 0);
        const outputTokens = result.output_tokens ?? 0;
        const modelRequests = result.num_model_requests ?? 0;
        const cost = estimateCost(getPrice(ANTHROPIC_PRICING, model), inputTokens, outputTokens);

        const current = modelMap.get(model) ?? {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: 0,
        };
        current.inputTokens += inputTokens;
        current.outputTokens += outputTokens;
        current.requests += modelRequests;
        current.cost += cost;
        modelMap.set(model, current);

        daily.inputTokens += inputTokens;
        daily.outputTokens += outputTokens;
        daily.requests += modelRequests;
        daily.cost += cost;
        input += inputTokens;
        output += outputTokens;
        requests += modelRequests;
      }
      dailyMap.set(date, daily);
    }

    const models = [...modelMap.values()].sort((a, b) => b.cost - a.cost);
    const dailyHistory = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const thisMonth = models.reduce((sum, item) => sum + item.cost, 0);
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
