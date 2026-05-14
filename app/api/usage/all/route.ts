import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchCursorUsage } from '@/lib/services/cursorService';
import { fetchFigmaUsage } from '@/lib/services/figmaService';
import { fetchGeminiUsage } from '@/lib/services/geminiService';
import { fetchOpenaiUsage } from '@/lib/services/openaiService';
import { fetchChatgptUsage } from '@/lib/services/chatgptService';
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

  const data = service === 'cursor' ? await fetchCursorUsage(usageRange) : await fetchers[service](usageRange);
  setCache(cacheKey, data);
  return data;
}

export async function GET(request: Request) {
  const usageRange = parseUsageRange(request);
  const [openai, gemini, cursor, figma, chatgpt] = await Promise.allSettled([
    getServiceUsage('openai', usageRange),
    getServiceUsage('gemini', usageRange),
    getServiceUsage('cursor', usageRange),
    getServiceUsage('figma', usageRange),
    getServiceUsage('chatgpt', usageRange),
  ]);

  const fallback = (service: ServiceId): ServiceUsage => ({
    service,
    connected: false,
    error: 'UNKNOWN',
    errorMessage: 'Service failed before returning a normalized response.',
    cost: { today: 0, thisMonth: 0 },
    tokens: { input: 0, output: 0, total: 0 },
    requests: 0,
    models: [],
    dailyHistory: [],
  });

  const data: AllUsageResponse = {
    openai: openai.status === 'fulfilled' ? openai.value : fallback('openai'),
    gemini: gemini.status === 'fulfilled' ? gemini.value : fallback('gemini'),
    cursor: cursor.status === 'fulfilled' ? cursor.value : fallback('cursor'),
    figma: figma.status === 'fulfilled' ? figma.value : fallback('figma'),
    chatgpt: chatgpt.status === 'fulfilled' ? chatgpt.value : fallback('chatgpt'),
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(data);
}
