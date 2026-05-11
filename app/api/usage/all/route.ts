import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchClaudeUsage } from '@/lib/services/claudeService';
import { fetchCursorUsage } from '@/lib/services/cursorService';
import { fetchFigmaUsage } from '@/lib/services/figmaService';
import { fetchGeminiUsage } from '@/lib/services/geminiService';
import { fetchOpenaiUsage } from '@/lib/services/openaiService';
import type { AllUsageResponse, ServiceId, ServiceUsage } from '@/lib/types';

const fetchers = {
  openai: fetchOpenaiUsage,
  gemini: fetchGeminiUsage,
  cursor: fetchCursorUsage,
  claude: fetchClaudeUsage,
  figma: fetchFigmaUsage,
} satisfies Record<ServiceId, () => Promise<ServiceUsage>>;

async function getServiceUsage(service: ServiceId): Promise<ServiceUsage> {
  const cached = getCache<ServiceUsage>(service);
  if (cached) return cached;

  const data = await fetchers[service]();
  setCache(service, data);
  return data;
}

export async function GET() {
  const [openai, gemini, cursor, claude, figma] = await Promise.allSettled([
    getServiceUsage('openai'),
    getServiceUsage('gemini'),
    getServiceUsage('cursor'),
    getServiceUsage('claude'),
    getServiceUsage('figma'),
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
    claude: claude.status === 'fulfilled' ? claude.value : fallback('claude'),
    figma: figma.status === 'fulfilled' ? figma.value : fallback('figma'),
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(data);
}
