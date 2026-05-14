import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchCursorUsage } from '@/lib/services/cursorService';
import { fetchFigmaUsage } from '@/lib/services/figmaService';
import { fetchGeminiUsage } from '@/lib/services/geminiService';
import { fetchOpenaiUsage } from '@/lib/services/openaiService';
import { fetchChatgptUsage } from '@/lib/services/chatgptService';
import { emptyUsage } from '@/lib/services/shared';
import type { AllUsageResponse, ServiceId, ServiceUsage } from '@/lib/types';

const fetchers = {
  openai: fetchOpenaiUsage,
  gemini: fetchGeminiUsage,
  figma: fetchFigmaUsage,
  chatgpt: fetchChatgptUsage,
} satisfies Record<Exclude<ServiceId, 'cursor'>, (range?: UsageRange) => Promise<ServiceUsage>>;

interface UsageRange {
  startDate?: number;
  endDate?: number;
}

function parseUsageRange(request: Request): UsageRange {
  const url = new URL(request.url);
  const start = url.searchParams.get('cursorStart');
  const end = url.searchParams.get('cursorEnd');
  const startDate = start ? Date.parse(`${start}T00:00:00.000Z`) : undefined;
  const endDate = end ? Date.parse(`${end}T23:59:59.999Z`) : undefined;

  return {
    startDate: Number.isFinite(startDate) ? startDate : undefined,
    endDate: Number.isFinite(endDate) ? endDate : undefined,
  };
}

async function getServiceUsage(service: ServiceId, usageRange: UsageRange): Promise<ServiceUsage> {
  const cacheKey =
    service === 'cursor' || service === 'figma' || service === 'chatgpt'
      ? `${service}:${usageRange.startDate ?? 'default'}:${usageRange.endDate ?? 'default'}`
      : service;
  const cached = getCache<ServiceUsage>(cacheKey);
  if (cached) return cached;

  try {
    const data = service === 'cursor' ? await fetchCursorUsage(usageRange) : await fetchers[service](usageRange);
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error(`[API:Usage] Failed to fetch ${service}:`, error);
    return emptyUsage(service, 'UNKNOWN', error instanceof Error ? error.message : String(error));
  }
}

export async function GET(request: Request) {
  const usageRange = parseUsageRange(request);
  const [openai, gemini, cursor, figma, chatgpt] = await Promise.all([
    getServiceUsage('openai', usageRange),
    getServiceUsage('gemini', usageRange),
    getServiceUsage('cursor', usageRange),
    getServiceUsage('figma', usageRange),
    getServiceUsage('chatgpt', usageRange),
  ]);

  const data: AllUsageResponse = {
    openai,
    gemini,
    cursor,
    figma,
    chatgpt,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(data);
}
