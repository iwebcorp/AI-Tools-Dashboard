import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchCursorUsage } from '@/lib/services/cursorService';
import type { ServiceUsage } from '@/lib/types';

function parseCursorRange(request: Request) {
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
  const range = parseCursorRange(request);
  const cacheKey = `cursor:${range.startDate ?? 'default'}:${range.endDate ?? 'default'}`;
  const cached = getCache<ServiceUsage>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const data = await fetchCursorUsage(range);
  setCache(cacheKey, data);
  return NextResponse.json(data);
}
