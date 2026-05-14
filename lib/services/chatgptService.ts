import 'server-only';

import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage } from './shared';

type JsonObject = Record<string, unknown>;

interface SurfaceUsage {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export async function fetchChatgptUsage(options: { startDate?: number; endDate?: number } = {}): Promise<ServiceUsage> {
  const cookies = process.env.CHATGPT_COOKIES;
  const bearerToken = process.env.CHATGPT_BEARER_TOKEN;
  
  if (!cookies || !bearerToken) {
    return emptyUsage('chatgpt', 'NOT_CONFIGURED', 'CHATGPT_COOKIES 및 CHATGPT_BEARER_TOKEN 설정이 필요합니다.');
  }

  const totals: ServiceUsage = {
    service: 'chatgpt',
    connected: true,
    cost: { today: 0, thisMonth: 0 },
    tokens: { input: 0, output: 0, total: 0 },
    requests: 0,
    models: [
      {
        model: 'ChatGPT Web',
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      },
      {
        model: 'Codex CLI',
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      }
    ],
    dailyHistory: [],
  };

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Cookie': cookies,
    'Authorization': `Bearer ${bearerToken}`
  };

  try {
    // 1. 대화 횟수 (conversations) 가져오기
    try {
      const convRes = await fetch('https://chatgpt.com/backend-api/conversations?offset=0&limit=50', { headers, cache: 'no-store' });
      if (convRes.ok) {
        const convData = await convRes.json();
        const items = convData.items || [];
        totals.requests = convData.total || items.length;
        totals.models[0].requests = totals.requests;
      }
    } catch (e) {
      console.warn('[ChatGPT] Failed to fetch conversations:', e);
    }

    // 2. 토큰 사용량 (wham API) 가져오기
    const now = Date.now();
    const end = new Date(options.endDate ?? now);
    const start = new Date(options.startDate ?? new Date(end.getFullYear(), end.getMonth(), 1).getTime());
    
    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const startDateStr = formatDate(start);
    const endDateStr = formatDate(end);
    
    const usageRes = await fetch(`https://chatgpt.com/backend-api/wham/analytics/daily-workspace-usage-counts?start_date=${startDateStr}&end_date=${endDateStr}&group_by=day`, { headers, cache: 'no-store' });
    
    if (usageRes.status === 401 || usageRes.status === 403) {
      return emptyUsage('chatgpt', 'SESSION_EXPIRED', 'ChatGPT Bearer Token 또는 Cookie가 만료되었습니다.');
    }

    if (usageRes.ok) {
      const usageData = (await usageRes.json()) as unknown;
      const buckets = getArray(getObject(usageData)?.data);
      
      let cliUsage: SurfaceUsage = { inputTokens: 0, outputTokens: 0, requests: 0 };
      let webUsage: SurfaceUsage = { inputTokens: 0, outputTokens: 0, requests: 0 };
      const cliDailyHistory: DailyUsage[] = [];
      const webDailyHistory: DailyUsage[] = [];

      totals.dailyHistory = buckets.map((bucket) => {
        const bucketObject = getObject(bucket) ?? {};
        const date = String(bucketObject.date ?? bucketObject.start_date ?? bucketObject.day ?? new Date().toISOString().slice(0, 10));
        const clients = getArray(bucketObject.clients);
        const dailyCli = clients
          .map(getObject)
          .filter(isCodexCliClient)
          .reduce<SurfaceUsage>((sum, client) => addSurfaceUsage(sum, readWorkspaceUsage(client)), { inputTokens: 0, outputTokens: 0, requests: 0 });
        const dailyTotal = readWorkspaceUsage(getObject(bucketObject.totals) ?? bucketObject);
        const dailyWeb = subtractSurfaceUsage(dailyTotal, dailyCli);
        
        cliUsage = addSurfaceUsage(cliUsage, dailyCli);
        webUsage = addSurfaceUsage(webUsage, dailyWeb);
        cliDailyHistory.push(surfaceUsageToDaily(date, dailyCli));
        webDailyHistory.push(surfaceUsageToDaily(date, dailyWeb));

        return {
          date,
          inputTokens: dailyCli.inputTokens + dailyWeb.inputTokens,
          outputTokens: dailyCli.outputTokens + dailyWeb.outputTokens,
          requests: dailyCli.requests + dailyWeb.requests,
          cost: 0 
        } satisfies DailyUsage;
      });

      totals.tokens.input = cliUsage.inputTokens + webUsage.inputTokens;
      totals.tokens.output = cliUsage.outputTokens + webUsage.outputTokens;
      totals.tokens.total = totals.tokens.input + totals.tokens.output;
      totals.requests = cliUsage.requests + webUsage.requests;
      
      totals.models[0] = applySurfaceUsage(totals.models[0], webUsage);
      totals.models[1] = applySurfaceUsage(totals.models[1], cliUsage);
      totals.models[0].dailyHistory = webDailyHistory;
      totals.models[1].dailyHistory = cliDailyHistory;
      
    } else {
      console.error('[ChatGPT] Wham API error:', usageRes.status);
    }

    // 빈 모델 제거
    totals.models = totals.models.filter(m => m.requests > 0 || m.inputTokens > 0 || m.outputTokens > 0);

    return totals;
  } catch (error) {
    console.error('[ChatGPT] Fetch error:', error);
    return emptyUsage('chatgpt', 'UNKNOWN', 'ChatGPT 데이터를 가져오는 중 오류가 발생했습니다.');
  }
}

function getObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isCodexCliClient(value: JsonObject | null): value is JsonObject {
  return value !== null && String(value.client_id ?? '') === 'CODEX_CLI';
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addSurfaceUsage(left: SurfaceUsage, right: SurfaceUsage): SurfaceUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    requests: left.requests + right.requests,
  };
}

function subtractSurfaceUsage(left: SurfaceUsage, right: SurfaceUsage): SurfaceUsage {
  return {
    inputTokens: Math.max(left.inputTokens - right.inputTokens, 0),
    outputTokens: Math.max(left.outputTokens - right.outputTokens, 0),
    requests: Math.max(left.requests - right.requests, 0),
  };
}

function applySurfaceUsage(model: ModelUsage, usage: SurfaceUsage): ModelUsage {
  return {
    ...model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    requests: usage.requests || model.requests,
  };
}

function readWorkspaceUsage(value: JsonObject): SurfaceUsage {
  return {
    inputTokens:
      numberValue(value.uncached_text_input_tokens ?? value.uncachedTextInputTokens) +
      numberValue(value.cached_text_input_tokens ?? value.cachedTextInputTokens),
    outputTokens: numberValue(value.text_output_tokens ?? value.textOutputTokens ?? value.output_tokens ?? value.outputTokens),
    requests: numberValue(value.turns ?? value.requests ?? value.request_count ?? value.requestCount),
  };
}

function surfaceUsageToDaily(date: string, usage: SurfaceUsage): DailyUsage {
  return {
    date,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    requests: usage.requests,
    cost: 0,
  };
}
