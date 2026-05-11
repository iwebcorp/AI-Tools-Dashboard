import 'server-only';

import { z } from 'zod';
import { estimateCost, getPrice, OPENAI_PRICING } from '@/lib/pricing';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { dateKeyFromUnix, emptyUsage, monthRange, toUnixSeconds, todayKey } from './shared';

const UsageResultSchema = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  num_model_requests: z.number().default(0),
  model: z.string().nullable(),
});

const UsageBucketSchema = z.object({
  start_time: z.number(),
  end_time: z.number(),
  results: z.array(UsageResultSchema),
});

const UsagePageSchema = z.object({
  data: z.array(UsageBucketSchema),
  has_more: z.boolean().optional(),
  next_page: z.string().nullable().optional(),
});

export async function fetchOpenaiUsage(): Promise<ServiceUsage> {
  const apiKey = process.env.OPENAI_ADMIN_KEY;
  if (!apiKey) {
    return emptyUsage('openai', 'NOT_CONFIGURED', 'OPENAI_ADMIN_KEY가 설정되지 않았습니다.');
  }

  try {
    const { start, end } = monthRange();
    const params = new URLSearchParams({
      start_time: String(toUnixSeconds(start)),
      end_time: String(toUnixSeconds(end)),
      bucket_width: '1d',
      limit: '31',
    });
    params.append('group_by[]', 'model');

    const buckets: z.infer<typeof UsageBucketSchema>[] = [];
    let page: string | null | undefined;

    do {
      if (page) params.set('page', page);
      const response = await fetch(
        `https://api.openai.com/v1/organization/usage/completions?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );

      if (response.status === 401 || response.status === 403) {
        return emptyUsage('openai', 'INVALID_KEY', 'OpenAI Admin key 권한을 확인하세요.');
      }
      if (response.status === 429) {
        return emptyUsage('openai', 'RATE_LIMIT', 'OpenAI Usage API rate limit에 도달했습니다.');
      }
      if (!response.ok) {
        return emptyUsage('openai', 'UNKNOWN', `OpenAI Usage API 오류: ${response.status}`);
      }

      const parsed = UsagePageSchema.safeParse(await response.json());
      if (!parsed.success) {
        return emptyUsage('openai', 'SCHEMA_CHANGED', 'OpenAI Usage API 응답 구조가 변경되었습니다.');
      }
      buckets.push(...parsed.data.data);
      page = parsed.data.has_more ? parsed.data.next_page : null;
    } while (page);

    const byModel = new Map<string, ModelUsage>();
    const byDate = new Map<string, DailyUsage>();
    let input = 0;
    let output = 0;
    let requests = 0;
    let thisMonth = 0;

    for (const bucket of buckets) {
      const date = dateKeyFromUnix(bucket.start_time);
      const daily = byDate.get(date) ?? {
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        cost: 0,
      };

      for (const result of bucket.results) {
        const model = result.model ?? 'unknown';
        const cost = estimateCost(
          getPrice(OPENAI_PRICING, model),
          result.input_tokens,
          result.output_tokens
        );
        const current = byModel.get(model) ?? {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: 0,
        };
        current.inputTokens += result.input_tokens;
        current.outputTokens += result.output_tokens;
        current.requests += result.num_model_requests;
        current.cost += cost;
        byModel.set(model, current);

        daily.inputTokens += result.input_tokens;
        daily.outputTokens += result.output_tokens;
        daily.requests += result.num_model_requests;
        daily.cost += cost;
        input += result.input_tokens;
        output += result.output_tokens;
        requests += result.num_model_requests;
        thisMonth += cost;
      }
      byDate.set(date, daily);
    }

    const dailyHistory = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const today = dailyHistory.find((entry) => entry.date === todayKey())?.cost ?? 0;

    return {
      service: 'openai',
      connected: true,
      cost: { today, thisMonth },
      tokens: { input, output, total: input + output },
      requests,
      models: [...byModel.values()].sort((a, b) => b.cost - a.cost),
      dailyHistory,
    };
  } catch (error) {
    console.error('[OpenAI] Usage fetch failed:', error);
    return emptyUsage('openai', 'UNKNOWN', 'OpenAI 사용량 조회 중 알 수 없는 오류가 발생했습니다.');
  }
}
