import 'server-only';

import { z } from 'zod';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage, todayKey } from './shared';

const CursorSchema = z.object({
  tokenUsage: z
    .object({
      todayTotalCents: z.number().optional(),
      totalCents: z.number().optional(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .optional(),
  usageBasedPricing: z
    .object({
      currentUsage: z
        .record(
          z.string(),
          z.object({
            numRequests: z.number().optional(),
            inputTokens: z.number().optional(),
            outputTokens: z.number().optional(),
            totalTokens: z.number().optional(),
            totalCents: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  recentRequests: z
    .array(
      z.object({
        timestamp: z.string().optional(),
        model: z.string().optional(),
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        costCents: z.number().optional(),
      })
    )
    .optional(),
});

function getTokensFromEnv(): string[] {
  const multi = process.env.CURSOR_SESSION_TOKENS?.split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (multi?.length) return multi;
  return process.env.CURSOR_SESSION_TOKEN ? [process.env.CURSOR_SESSION_TOKEN] : [];
}

export async function fetchCursorUsage(): Promise<ServiceUsage> {
  const sessionTokens = getTokensFromEnv();
  if (sessionTokens.length === 0) {
    return emptyUsage('cursor', 'NOT_CONFIGURED', 'CURSOR_SESSION_TOKEN 또는 CURSOR_SESSION_TOKENS가 설정되지 않았습니다.');
  }

  try {
    const totals: ServiceUsage = {
      service: 'cursor',
      connected: true,
      cost: { today: 0, thisMonth: 0 },
      tokens: { input: 0, output: 0, total: 0 },
      requests: 0,
      models: [],
      dailyHistory: [],
    };
    const modelMap = new Map<string, ModelUsage>();
    const dailyMap = new Map<string, DailyUsage>();

    for (const sessionToken of sessionTokens) {
      const response = await fetch('https://www.cursor.com/api/usage', {
        headers: {
          Cookie: `WorkosCursorSessionToken=${sessionToken}`,
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
      });

      if (response.status === 401 || response.status === 403) {
        return emptyUsage('cursor', 'SESSION_EXPIRED', 'cursor.com/settings에서 WorkosCursorSessionToken을 재발급하세요.');
      }
      if (!response.ok) {
        return emptyUsage('cursor', 'UNKNOWN', `Cursor 사용량 API 오류: ${response.status}`);
      }

      const raw: unknown = await response.json();
      const parsed = CursorSchema.safeParse(raw);
      if (!parsed.success) {
        console.error('[Cursor] Schema changed:', raw);
        return emptyUsage('cursor', 'SCHEMA_CHANGED', 'Cursor 사용량 API 응답 구조가 변경되었습니다.');
      }

      const usage = parsed.data;
      const input = usage.tokenUsage?.inputTokens ?? 0;
      const output = usage.tokenUsage?.outputTokens ?? 0;
      const total = usage.tokenUsage?.totalTokens ?? input + output;
      totals.tokens.input += input;
      totals.tokens.output += output;
      totals.tokens.total += total;
      totals.cost.today += (usage.tokenUsage?.todayTotalCents ?? 0) / 100;
      totals.cost.thisMonth += (usage.tokenUsage?.totalCents ?? 0) / 100;

      for (const [model, item] of Object.entries(usage.usageBasedPricing?.currentUsage ?? {})) {
        const modelInput = item.inputTokens ?? 0;
        const modelOutput = item.outputTokens ?? 0;
        const modelRequests = item.numRequests ?? 0;
        const modelCost = (item.totalCents ?? 0) / 100;
        const current = modelMap.get(model) ?? {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: 0,
        };
        current.inputTokens += modelInput;
        current.outputTokens += modelOutput;
        current.requests += modelRequests;
        current.cost += modelCost;
        modelMap.set(model, current);
        totals.requests += modelRequests;
      }

      for (const request of usage.recentRequests ?? []) {
        if (!request.timestamp) continue;
        const date = request.timestamp.slice(0, 10);
        const current = dailyMap.get(date) ?? {
          date,
          inputTokens: 0,
          outputTokens: 0,
          requests: 0,
          cost: 0,
        };
        current.inputTokens += request.inputTokens ?? 0;
        current.outputTokens += request.outputTokens ?? 0;
        current.requests += 1;
        current.cost += (request.costCents ?? 0) / 100;
        dailyMap.set(date, current);
      }
    }

    if (dailyMap.size === 0 && (totals.cost.today > 0 || totals.requests > 0)) {
      dailyMap.set(todayKey(), {
        date: todayKey(),
        inputTokens: totals.tokens.input,
        outputTokens: totals.tokens.output,
        requests: totals.requests,
        cost: totals.cost.today,
      });
    }

    totals.models = [...modelMap.values()].sort((a, b) => b.cost - a.cost);
    totals.dailyHistory = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    return totals;
  } catch (error) {
    console.error('[Cursor] Usage fetch failed:', error);
    return emptyUsage('cursor', 'UNKNOWN', 'Cursor 사용량 조회 중 알 수 없는 오류가 발생했습니다.');
  }
}
