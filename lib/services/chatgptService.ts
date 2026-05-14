import 'server-only';

import type { ServiceUsage } from '@/lib/types';
import { emptyUsage } from './shared';

export async function fetchChatgptUsage(options: { cursorStart?: string; cursorEnd?: string } = {}): Promise<ServiceUsage> {
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
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const startDateStr = formatDate(start);
    const endDateStr = formatDate(today);
    
    const usageRes = await fetch(`https://chatgpt.com/backend-api/wham/usage/daily-token-usage-breakdown?start_date=${startDateStr}&end_date=${endDateStr}&group_by=day`, { headers, cache: 'no-store' });
    
    if (usageRes.status === 401 || usageRes.status === 403) {
      return emptyUsage('chatgpt', 'SESSION_EXPIRED', 'ChatGPT Bearer Token 또는 Cookie가 만료되었습니다.');
    }

    if (usageRes.ok) {
      const usageData = await usageRes.json();
      const buckets = usageData.data || [];
      
      let totalCli = 0;
      let totalWeb = 0;

      totals.dailyHistory = buckets.map((bucket: any) => {
        const date = bucket.date;
        const vals = bucket.product_surface_usage_values || {};
        const cliTokens = vals.cli || 0;
        const webTokens = vals.web || 0;
        
        totalCli += cliTokens;
        totalWeb += webTokens;

        return {
          date,
          inputTokens: cliTokens + webTokens,
          outputTokens: 0,
          requests: 0,
          cost: 0 
        };
      });

      totals.tokens.total = totalCli + totalWeb;
      totals.tokens.input = totalCli + totalWeb; 
      
      totals.models[0].inputTokens = totalWeb; // Web
      totals.models[1].inputTokens = totalCli; // Codex CLI
      
    } else {
      console.error('[ChatGPT] Wham API error:', usageRes.status);
    }

    // 빈 모델 제거
    totals.models = totals.models.filter(m => m.requests > 0 || m.inputTokens > 0);

    return totals;
  } catch (error) {
    console.error('[ChatGPT] Fetch error:', error);
    return emptyUsage('chatgpt', 'UNKNOWN', 'ChatGPT 데이터를 가져오는 중 오류가 발생했습니다.');
  }
}
