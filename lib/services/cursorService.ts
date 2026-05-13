import 'server-only';

import { z } from 'zod';
import type { AccountUsage, DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage, todayKey } from './shared';

const CURSOR_FETCH_TIMEOUT_MS = 12_000;
const NumberLikeSchema = z.union([z.number(), z.string()]);

const CursorSchema = z
  .object({
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
  })
  .passthrough();

const LegacyUsageItemSchema = z
  .object({
    numRequests: z.number().optional(),
    numRequestsTotal: z.number().optional(),
    numTokens: z.number().optional(),
    maxTokenUsage: z.number().nullable().optional(),
    maxRequestUsage: z.number().nullable().optional(),
  })
  .passthrough();

const LegacyCursorSchema = z
  .object({
    startOfMonth: z.string().optional(),
  })
  .passthrough();

const CurrentPeriodUsageSchema = z
  .object({
    billingCycleStart: NumberLikeSchema,
    billingCycleEnd: NumberLikeSchema.optional(),
    planUsage: z
      .object({
        totalSpend: z.number().optional(),
        includedSpend: z.number().optional(),
        bonusSpend: z.number().optional(),
        limit: z.number().optional(),
        autoPercentUsed: z.number().optional(),
        apiPercentUsed: z.number().optional(),
        totalPercentUsed: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const AggregationSchema = z
  .object({
    model: z.string().optional(),
    modelIntent: z.string().optional(),
    inputTokens: NumberLikeSchema.optional(),
    outputTokens: NumberLikeSchema.optional(),
    cacheWriteTokens: NumberLikeSchema.optional(),
    cacheReadTokens: NumberLikeSchema.optional(),
    totalCents: NumberLikeSchema.optional(),
    tier: NumberLikeSchema.optional(),
  })
  .passthrough();

const AggregatedUsageSchema = z
  .object({
    aggregations: z.array(AggregationSchema).optional(),
    totalInputTokens: NumberLikeSchema.optional(),
    totalOutputTokens: NumberLikeSchema.optional(),
    totalCacheWriteTokens: NumberLikeSchema.optional(),
    totalCacheReadTokens: NumberLikeSchema.optional(),
    totalCostCents: NumberLikeSchema.optional(),
  })
  .passthrough();

const FilteredUsageEventSchema = z
  .object({
    timestamp: NumberLikeSchema.optional(),
    model: z.string().optional(),
    chargedCents: NumberLikeSchema.optional(),
    tokenUsage: z
      .object({
        inputTokens: NumberLikeSchema.optional(),
        outputTokens: NumberLikeSchema.optional(),
        cacheWriteTokens: NumberLikeSchema.optional(),
        cacheReadTokens: NumberLikeSchema.optional(),
        totalCents: NumberLikeSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const FilteredUsageSchema = z
  .object({
    totalUsageEventsCount: z.number().optional(),
    usageEventsDisplay: z.array(FilteredUsageEventSchema).optional(),
  })
  .passthrough();

const DashboardMeSchema = z
  .object({
    email: z.string().optional(),
    user: z
      .object({
        email: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

interface CursorSession {
  token: string;
  userId: string;
}

interface CursorUsageOptions {
  startDate?: number;
  endDate?: number;
}

function getCookieStringsFromEnv(): string[] {
  return (
    process.env.CURSOR_COOKIE_STRINGS?.split('||')
      .map((cookie) => cookie.trim().replace(/^Cookie:\s*/i, ''))
      .filter(Boolean) ?? []
  );
}

function getCursorAccountLabels(count: number): string[] {
  const configured =
    process.env.CURSOR_ACCOUNT_LABELS?.split(',')
      .map((label) => label.trim())
      .filter(Boolean) ?? [];
  if (configured.length >= 0) {
    return Array.from({ length: count }, (_, index) => configured[index] ?? `회사 ${index + 1}`);
  }
  return Array.from({ length: count }, (_, index) => configured[index] ?? `회사 ${index + 1}`);
}

function getSessionsFromEnv(): CursorSession[] {
  const multi = process.env.CURSOR_SESSION_TOKENS?.split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map(toCursorSession)
    .filter((session) => session.userId.length > 0);
  if (multi?.length) return multi;
  if (!process.env.CURSOR_SESSION_TOKEN) return [];
  const session = toCursorSession(process.env.CURSOR_SESSION_TOKEN);
  return session.userId ? [session] : [];
}

function toCursorSession(token: string): CursorSession {
  const trimmed = token.trim();
  return {
    token: trimmed,
    userId: extractUserId(trimmed),
  };
}

function extractUserId(token: string): string {
  try {
    return decodeURIComponent(token).split('::')[0];
  } catch {
    return token.split('%3A%3A')[0].split('::')[0];
  }
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function dashboardModelName(aggregation: z.infer<typeof AggregationSchema>): string {
  if (aggregation.model) return aggregation.model;
  if (aggregation.modelIntent && aggregation.modelIntent !== 'default') return aggregation.modelIntent;
  if (numberValue(aggregation.tier) === 2) return 'auto';
  if (numberValue(aggregation.tier) === 1) return 'api';
  return aggregation.modelIntent ?? 'cursor';
}

async function postCursorDashboard(cookie: string, path: string, body: object): Promise<unknown> {
  const response = await fetch(`https://cursor.com${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'https://cursor.com',
      Referer: 'https://cursor.com/dashboard/spending',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(CURSOR_FETCH_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`SESSION_EXPIRED:${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`UNKNOWN:${response.status}`);
  }
  return response.json();
}

async function fetchDashboardEmail(cookie: string): Promise<string | null> {
  try {
    const raw = await postCursorDashboard(cookie, '/api/dashboard/get-me', {});
    const parsed = DashboardMeSchema.safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data.email ?? parsed.data.user?.email ?? null;
  } catch {
    return null;
  }
}

async function fetchFilteredUsageEvents(
  cookie: string,
  startDate: number,
  endDate: number
): Promise<z.infer<typeof FilteredUsageSchema>> {
  const pageSize = 1000;
  const firstRaw = await postCursorDashboard(cookie, '/api/dashboard/get-filtered-usage-events', {
    startDate,
    endDate,
    page: 1,
    pageSize,
  });
  const first = FilteredUsageSchema.safeParse(firstRaw);
  if (!first.success) {
    console.error('[Cursor] Filtered usage schema changed:', firstRaw);
    throw new Error('SCHEMA_CHANGED:filtered');
  }

  const total = first.data.totalUsageEventsCount ?? first.data.usageEventsDisplay?.length ?? 0;
  const usageEventsDisplay = [...(first.data.usageEventsDisplay ?? [])];
  const maxPages = 20;

  for (let page = 2; usageEventsDisplay.length < total && page <= maxPages; page += 1) {
    const raw = await postCursorDashboard(cookie, '/api/dashboard/get-filtered-usage-events', {
      startDate,
      endDate,
      page,
      pageSize,
    });
    const parsed = FilteredUsageSchema.safeParse(raw);
    if (!parsed.success) {
      console.error('[Cursor] Filtered usage schema changed:', raw);
      throw new Error('SCHEMA_CHANGED:filtered');
    }
    usageEventsDisplay.push(...(parsed.data.usageEventsDisplay ?? []));
  }

  return {
    ...first.data,
    usageEventsDisplay,
  };
}

async function fetchDashboardCookieUsage(cookieStrings: string[], options: CursorUsageOptions = {}): Promise<ServiceUsage> {
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
  const accountLabels = getCursorAccountLabels(cookieStrings.length);
  const accounts: AccountUsage[] = [];

  for (const [index, cookie] of cookieStrings.entries()) {
    const email = await fetchDashboardEmail(cookie);
    const label = email ? `${accountLabels[index]} (${email})` : accountLabels[index];
    const account: AccountUsage = {
      label,
      cost: { today: 0, thisMonth: 0 },
      tokens: { input: 0, output: 0, total: 0 },
      requests: 0,
      models: [],
      dailyHistory: [],
    };
    const accountModelMap = new Map<string, ModelUsage>();
    const accountDailyMap = new Map<string, DailyUsage>();

    const currentRaw = await postCursorDashboard(cookie, '/api/dashboard/get-current-period-usage', {});
    const current = CurrentPeriodUsageSchema.safeParse(currentRaw);
    if (!current.success) {
      console.error('[Cursor] Current period schema changed:', currentRaw);
      return emptyUsage('cursor', 'SCHEMA_CHANGED', 'Cursor current period API 응답 구조가 변경되었습니다.');
    }

    const billingStart = numberValue(current.data.billingCycleStart);
    const billingEnd = Math.min(numberValue(current.data.billingCycleEnd) || Date.now(), Date.now());
    const startDate = options.startDate ?? billingStart;
    const endDate = options.endDate ?? billingEnd;
    const aggregateRaw = await postCursorDashboard(cookie, '/api/dashboard/get-aggregated-usage-events', {
      startDate,
      endDate,
    });
    const aggregate = AggregatedUsageSchema.safeParse(aggregateRaw);
    if (!aggregate.success) {
      console.error('[Cursor] Aggregated usage schema changed:', aggregateRaw);
      return emptyUsage('cursor', 'SCHEMA_CHANGED', 'Cursor aggregated usage API 응답 구조가 변경되었습니다.');
    }

    const filteredRaw = await fetchFilteredUsageEvents(cookie, startDate, endDate);
    const filtered = { success: true as const, data: filteredRaw };
    if (!filtered.success) {
      console.error('[Cursor] Filtered usage schema changed:', filteredRaw);
      return emptyUsage('cursor', 'SCHEMA_CHANGED', 'Cursor usage events API 응답 구조가 변경되었습니다.');
    }

    const aggregateData = aggregate.data;
    const accountInput =
      numberValue(aggregateData.totalInputTokens) +
      numberValue(aggregateData.totalCacheWriteTokens) +
      numberValue(aggregateData.totalCacheReadTokens);
    const accountOutput = numberValue(aggregateData.totalOutputTokens);
    const accountCost = numberValue(aggregateData.totalCostCents) / 100;

    totals.tokens.input += accountInput;
    totals.tokens.output += accountOutput;
    totals.tokens.total += accountInput + accountOutput;
    totals.cost.thisMonth += accountCost;
    totals.requests += filtered.data.totalUsageEventsCount ?? 0;
    account.tokens.input += accountInput;
    account.tokens.output += accountOutput;
    account.tokens.total += accountInput + accountOutput;
    account.cost.thisMonth += accountCost;
    account.requests += filtered.data.totalUsageEventsCount ?? 0;

    for (const item of aggregateData.aggregations ?? []) {
      const inputTokens =
        numberValue(item.inputTokens) + numberValue(item.cacheWriteTokens) + numberValue(item.cacheReadTokens);
      const outputTokens = numberValue(item.outputTokens);
      const model = dashboardModelName(item);
      const cost = numberValue(item.totalCents) / 100;
      addModelUsage(modelMap, model, inputTokens, outputTokens, 0, cost);
      addModelUsage(accountModelMap, model, inputTokens, outputTokens, 0, cost);
    }

    for (const event of filtered.data.usageEventsDisplay ?? []) {
      const timestamp = numberValue(event.timestamp);
      if (!timestamp) continue;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const tokenUsage = event.tokenUsage;
      const inputTokens =
        numberValue(tokenUsage?.inputTokens) +
        numberValue(tokenUsage?.cacheWriteTokens) +
        numberValue(tokenUsage?.cacheReadTokens);
      const outputTokens = numberValue(tokenUsage?.outputTokens);
      const cost = numberValue(event.chargedCents ?? tokenUsage?.totalCents) / 100;
      const currentDaily = dailyMap.get(date) ?? {
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        cost: 0,
      };
      currentDaily.inputTokens += inputTokens;
      currentDaily.outputTokens += outputTokens;
      currentDaily.requests += 1;
      currentDaily.cost += cost;
      dailyMap.set(date, currentDaily);

      const accountCurrentDaily = accountDailyMap.get(date) ?? {
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        cost: 0,
      };
      accountCurrentDaily.inputTokens += inputTokens;
      accountCurrentDaily.outputTokens += outputTokens;
      accountCurrentDaily.requests += 1;
      accountCurrentDaily.cost += cost;
      accountDailyMap.set(date, accountCurrentDaily);
    }

    account.models = [...accountModelMap.values()].sort((a, b) => b.cost - a.cost);
    account.dailyHistory = [...accountDailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    account.cost.today = account.dailyHistory.find((entry) => entry.date === todayKey())?.cost ?? 0;
    accounts.push(account);
  }

  totals.models = [...modelMap.values()].sort((a, b) => b.cost - a.cost);
  totals.dailyHistory = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  totals.cost.today = totals.dailyHistory.find((entry) => entry.date === todayKey())?.cost ?? 0;
  totals.accounts = accounts;
  return totals;
}

function getLegacyUsageItems(raw: unknown): Array<[string, z.infer<typeof LegacyUsageItemSchema>]> {
  const parsed = LegacyCursorSchema.safeParse(raw);
  if (!parsed.success) return [];

  const items: Array<[string, z.infer<typeof LegacyUsageItemSchema>]> = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === 'startOfMonth') continue;
    const item = LegacyUsageItemSchema.safeParse(value);
    if (item.success) items.push([key, item.data]);
  }
  return items;
}

export async function fetchCursorUsage(options: CursorUsageOptions = {}): Promise<ServiceUsage> {
  const cookieStrings = getCookieStringsFromEnv();
  if (cookieStrings.length > 0) {
    try {
      return await fetchDashboardCookieUsage(cookieStrings, options);
    } catch (error) {
      console.error('[Cursor] Dashboard usage fetch failed:', error);
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('SCHEMA_CHANGED')) {
        return emptyUsage('cursor', 'SCHEMA_CHANGED', 'Cursor usage events API 응답 구조가 변경되었습니다.');
      }
      if (message.startsWith('SESSION_EXPIRED')) {
        return emptyUsage('cursor', 'SESSION_EXPIRED', 'Cursor dashboard cookie를 브라우저에서 다시 복사하세요.');
      }
      return emptyUsage('cursor', 'UNKNOWN', 'Cursor dashboard 사용량 조회 중 오류가 발생했습니다.');
    }
  }

  const sessions = getSessionsFromEnv();
  if (sessions.length === 0) {
    return emptyUsage(
      'cursor',
      'NOT_CONFIGURED',
      'CURSOR_COOKIE_STRINGS 또는 CURSOR_SESSION_TOKENS가 설정되지 않았습니다.'
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

    for (const session of sessions) {
      const response = await fetch(`https://cursor.com/api/usage?user=${encodeURIComponent(session.userId)}`, {
        headers: {
          Accept: 'application/json',
          Cookie: `WorkosCursorSessionToken=${session.token}`,
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(CURSOR_FETCH_TIMEOUT_MS),
      });

      if (response.status === 401 || response.status === 403) {
        return emptyUsage('cursor', 'SESSION_EXPIRED', 'cursor.com에서 WorkosCursorSessionToken을 다시 복사하세요.');
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
      const legacyUsageItems = getLegacyUsageItems(raw);
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

      if (!currentUsage && legacyUsageItems.length > 0) {
        for (const [model, item] of legacyUsageItems) {
          const requests = item.numRequests ?? item.numRequestsTotal ?? 0;
          const totalTokens = item.numTokens ?? 0;
          addModelUsage(modelMap, model, totalTokens, 0, requests, 0);
          accountRequests += requests;
          accountTotal += totalTokens;
        }
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
