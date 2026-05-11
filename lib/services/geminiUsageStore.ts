import 'server-only';

import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { estimateCost, GEMINI_PRICING, getPrice } from '@/lib/pricing';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';

const usageDir = path.join(process.cwd(), 'data');
const usageFile = path.join(usageDir, 'gemini-usage.jsonl');

const GeminiUsageRecordSchema = z.object({
  timestamp: z.string(),
  project: z.string(),
  model: z.string(),
  promptTokens: z.number(),
  candidatesTokens: z.number(),
  totalTokens: z.number(),
  cost: z.number(),
});

export type GeminiUsageRecord = z.infer<typeof GeminiUsageRecordSchema>;

export function getGeminiApiKeys(): Map<string, string> {
  const entries = new Map<string, string>();
  const multi = process.env.GEMINI_API_KEYS;

  if (multi) {
    for (const item of multi.split(',')) {
      const separator = item.indexOf(':');
      if (separator <= 0) continue;
      const label = item.slice(0, separator).trim();
      const key = item.slice(separator + 1).trim();
      if (label && key) entries.set(label, key);
    }
  }

  if (process.env.GEMINI_API_KEY && !entries.has('default')) {
    entries.set('default', process.env.GEMINI_API_KEY);
  }

  return entries;
}

export async function appendGeminiUsage(record: GeminiUsageRecord): Promise<void> {
  await mkdir(usageDir, { recursive: true });
  await appendFile(usageFile, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function readGeminiUsage(): Promise<GeminiUsageRecord[]> {
  try {
    const content = await readFile(usageFile, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        const parsedJson = z.unknown().safeParse(JSON.parse(line));
        if (!parsedJson.success) return [];
        const parsed = GeminiUsageRecordSchema.safeParse(parsedJson.data);
        return parsed.success ? [parsed.data] : [];
      });
  } catch {
    return [];
  }
}

export async function aggregateGeminiTrackedUsage(): Promise<ServiceUsage> {
  const keys = getGeminiApiKeys();
  const records = await readGeminiUsage();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthRecords = records.filter((record) => new Date(record.timestamp) >= monthStart);

  const modelMap = new Map<string, ModelUsage>();
  const dailyMap = new Map<string, DailyUsage>();
  let input = 0;
  let output = 0;
  let thisMonth = 0;

  for (const record of monthRecords) {
    const date = record.timestamp.slice(0, 10);
    const currentModel = modelMap.get(record.model) ?? {
      model: record.model,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      cost: 0,
    };
    currentModel.inputTokens += record.promptTokens;
    currentModel.outputTokens += record.candidatesTokens;
    currentModel.requests += 1;
    currentModel.cost += record.cost;
    modelMap.set(record.model, currentModel);

    const currentDaily = dailyMap.get(date) ?? {
      date,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      cost: 0,
    };
    currentDaily.inputTokens += record.promptTokens;
    currentDaily.outputTokens += record.candidatesTokens;
    currentDaily.requests += 1;
    currentDaily.cost += record.cost;
    dailyMap.set(date, currentDaily);

    input += record.promptTokens;
    output += record.candidatesTokens;
    thisMonth += record.cost;
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    service: 'gemini',
    connected: keys.size > 0,
    error: keys.size > 0 ? undefined : 'NOT_CONFIGURED',
    errorMessage:
      keys.size > 0
        ? monthRecords.length === 0
          ? 'Gemini proxy tracking is configured. 아직 누적된 호출 기록이 없습니다.'
          : 'Gemini proxy tracking data. 이 값은 proxy를 거친 호출만 포함합니다.'
        : 'GEMINI_API_KEY 또는 GEMINI_API_KEYS가 설정되지 않았습니다.',
    cost: {
      today: dailyMap.get(today)?.cost ?? 0,
      thisMonth,
    },
    tokens: {
      input,
      output,
      total: input + output,
    },
    requests: monthRecords.length,
    models: [...modelMap.values()].sort((a, b) => b.cost - a.cost),
    dailyHistory: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function buildGeminiUsageRecord(input: {
  project: string;
  model: string;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}): GeminiUsageRecord {
  const cost = estimateCost(
    getPrice(GEMINI_PRICING, input.model),
    input.promptTokens,
    input.candidatesTokens
  );

  return {
    timestamp: new Date().toISOString(),
    project: input.project,
    model: input.model,
    promptTokens: input.promptTokens,
    candidatesTokens: input.candidatesTokens,
    totalTokens: input.totalTokens,
    cost,
  };
}
