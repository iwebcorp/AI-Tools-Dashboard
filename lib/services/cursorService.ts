import 'server-only';

import { z } from 'zod';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage, todayKey } from './shared';

const CURSOR_FETCH_TIMEOUT_MS = 12_000;

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

const BillingProfileSchema = z
  .object({
    membershipType: z.string().optional(),
    billingType: z.string().optional(),
    usageBasedPricing: z.unknown().optional(),
  })
  .passthrough();

function getTokensFromEnv(): string[] {
  const multi = process.env.CURSOR_SESSION_TOKENS?.split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (multi?.length) return multi;
  return process.env.CURSOR_SESSION_TOKEN ? [process.env.CURSOR_SESSION_TOKEN] : [];
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

async function detectBillingProfile(sessionToken: string): Promise<void> {
  try {
    const response = await fetch('https://api2.cursor.sh/auth/full_stripe_profile', {
      headers: {
        Cookie: `WorkosCursorSessionToken=${sessionToken}`,
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(CURSOR_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return;
    BillingProfileSchema.safeParse(await response.json());
  } catch {
    // Billing profile detection is only advisory; usage fetching remains authoritative.
  }
}

export async function fetchCursorUsage(): Promise<ServiceUsage> {
  const sessionTokens = getTokensFromEnv();
  if (sessionTokens.length === 0) {
    return emptyUsage(
      'cursor',
      'NOT_CONFIGURED',
      'CURSOR_SESSION_TOKEN 또는 CURSOR_SESSION_TOKENS가 설정되지 않았습니다.'
    );
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
      await detectBillingProfile(sessionToken);

      const response = await fetch('https://www.cursor.com/api/usage', {
        headers: {
          Cookie: `WorkosCursorSessionToken=${sessionToken}`,
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(CURSOR_FETCH_TIMEOUT_MS),
      });

      if (response.status === 401 || response.status === 403) {
        return emptyUsage(
          'cursor',
          'SESSION_EXPIRED',
          'cursor.com/settings에서 WorkosCursorSessionToken을 재발급하세요.'
        );
      }
      if (!response.ok) {
        return emptyUsage('cursor', 'UNKNOWN', `Cursor usage API error: ${response.status}`);
      }

      const raw: unknown = await response.json();
      const parsed = CursorSchema.safeParse(raw);
      if (!parsed.success) {
        console.error('[Cursor] Schema changed:', raw);
        return emptyUsage('cursor', 'SCHEMA_CHANGED', 'Cursor usage API 응답 구조가 변경되었습니다.');
      }

      const usage = parsed.data;
      const currentUsage = usage.usageBasedPricing?.currentUsage;
      let accountInput = usage.tokenUsage?.inputTokens ?? 0;
      let accountOutput = usage.tokenUsage?.outputTokens ?? 0;
      let accountTotal = usage.tokenUsage?.totalTokens ?? accountInput + accountOutput;
      let accountRequests = 0;
      let accountMonthlyCents = usage.tokenUsage?.totalCents ?? 0;

      for (const [model, item] of Object.entries(currentUsage ?? {})) {
        const inputTokens = item.inputTokens ?? 0;
        const outputTokens = item.outputTokens ?? 0;
        const requests = item.numRequests ?? 0;
        const cost = (item.totalCents ?? 0) / 100;
        addModelUsage(modelMap, model, inputTokens, outputTokens, requests, cost);
        accountRequests += requests;
      }

      if (accountTotal === 0 && currentUsage) {
        accountInput = Object.values(currentUsage).reduce((sum, item) => sum + (item.inputTokens ?? 0), 0);
        accountOutput = Object.values(currentUsage).reduce((sum, item) => sum + (item.outputTokens ?? 0), 0);
        accountTotal = Object.values(currentUsage).reduce(
          (sum, item) => sum + (item.totalTokens ?? (item.inputTokens ?? 0) + (item.outputTokens ?? 0)),
          0
        );
      }

      if (accountMonthlyCents === 0 && currentUsage) {
        accountMonthlyCents = Object.values(currentUsage).reduce((sum, item) => sum + (item.totalCents ?? 0), 0);
      }

      for (const request of usage.recentRequests ?? []) {
        const requestInput = request.inputTokens ?? 0;
        const requestOutput = request.outputTokens ?? 0;
        const requestCost = (request.costCents ?? 0) / 100;

        if (!currentUsage && request.model) {
          addModelUsage(modelMap, request.model, requestInput, requestOutput, 1, requestCost);
        }

        if (!request.timestamp) continue;
        const date = request.timestamp.slice(0, 10);
        const current = dailyMap.get(date) ?? {
          date,
          inputTokens: 0,
          outputTokens: 0,
          requests: 0,
          cost: 0,
        };
        current.inputTokens += requestInput;
        current.outputTokens += requestOutput;
        current.requests += 1;
        current.cost += requestCost;
        dailyMap.set(date, current);
      }

      if (accountRequests === 0) {
        accountRequests = usage.recentRequests?.length ?? 0;
      }

      totals.tokens.input += accountInput;
      totals.tokens.output += accountOutput;
      totals.tokens.total += accountTotal;
      totals.cost.today += (usage.tokenUsage?.todayTotalCents ?? 0) / 100;
      totals.cost.thisMonth += accountMonthlyCents / 100;
      totals.requests += accountRequests;
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
