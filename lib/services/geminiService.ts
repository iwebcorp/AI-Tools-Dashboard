import 'server-only';

import { MetricServiceClient } from '@google-cloud/monitoring';
import { estimateCost, GEMINI_PRICING, getPrice } from '@/lib/pricing';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage, monthRange } from './shared';
import { aggregateGeminiTrackedUsage, getGeminiApiKeys } from './geminiUsageStore';

export async function fetchGeminiUsage(): Promise<ServiceUsage> {
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const apiKeys = getGeminiApiKeys();

  if (!credentials && apiKeys.size > 0) {
    return aggregateGeminiTrackedUsage();
  }

  if (!credentials || !projectId) {
    return emptyUsage('gemini', 'NOT_CONFIGURED', 'GOOGLE_APPLICATION_CREDENTIALS와 GOOGLE_PROJECT_ID가 필요합니다.');
  }

  try {
    const { start, end } = monthRange();
    const client = new MetricServiceClient();
    const [timeSeries] = await client.listTimeSeries({
      name: client.projectPath(projectId),
      filter: 'metric.type="aiplatform.googleapis.com/publisher/online_serving/token_count"',
      interval: {
        startTime: { seconds: Math.floor(start.getTime() / 1000) },
        endTime: { seconds: Math.floor(end.getTime() / 1000) },
      },
      view: 'FULL',
    });

    const modelMap = new Map<string, ModelUsage>();
    const dailyMap = new Map<string, DailyUsage>();
    let input = 0;
    let output = 0;

    for (const series of timeSeries) {
      const labels = series.metric?.labels ?? {};
      const model = labels.model || labels.model_display_name || 'gemini';
      const tokenType = labels.type === 'output' ? 'output' : 'input';

      for (const point of series.points ?? []) {
        const value = Number(point.value?.int64Value ?? 0);
        const seconds = Number(point.interval?.endTime?.seconds ?? 0);
        const date = seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const currentModel = modelMap.get(model) ?? {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: 0,
        };
        const currentDaily = dailyMap.get(date) ?? {
          date,
          inputTokens: 0,
          outputTokens: 0,
          requests: 0,
          cost: 0,
        };

        if (tokenType === 'output') {
          output += value;
          currentModel.outputTokens += value;
          currentDaily.outputTokens += value;
        } else {
          input += value;
          currentModel.inputTokens += value;
          currentDaily.inputTokens += value;
        }

        modelMap.set(model, currentModel);
        dailyMap.set(date, currentDaily);
      }
    }

    for (const item of modelMap.values()) {
      item.cost = estimateCost(getPrice(GEMINI_PRICING, item.model), item.inputTokens, item.outputTokens);
    }

    for (const day of dailyMap.values()) {
      day.cost = estimateCost(getPrice(GEMINI_PRICING, 'default'), day.inputTokens, day.outputTokens);
    }

    const models = [...modelMap.values()].sort((a, b) => b.cost - a.cost);
    const dailyHistory = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const thisMonth = models.reduce((sum, item) => sum + item.cost, 0);
    const today = dailyHistory.find((entry) => entry.date === new Date().toISOString().slice(0, 10))?.cost ?? 0;

    return {
      service: 'gemini',
      connected: true,
      cost: { today, thisMonth },
      tokens: { input, output, total: input + output },
      requests: 0,
      models,
      dailyHistory,
    };
  } catch (error) {
    console.error('[Gemini] Usage fetch failed:', error);
    return emptyUsage('gemini', 'UNKNOWN', 'Gemini 사용량 조회 중 알 수 없는 오류가 발생했습니다.');
  }
}
