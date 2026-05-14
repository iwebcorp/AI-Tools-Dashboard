import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchChatgptUsage } from '@/lib/services/chatgptService';
import type { ServiceUsage } from '@/lib/types';

function parseUsageRange(request: Request) {
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

export async function GET(request: Request) {
  const range = parseUsageRange(request);
  const cacheKey = `chatgpt:${range.startDate ?? 'default'}:${range.endDate ?? 'default'}`;
  const cached = getCache<ServiceUsage>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const data = await fetchChatgptUsage(range);
  setCache(cacheKey, data);
  return NextResponse.json(data);
}
