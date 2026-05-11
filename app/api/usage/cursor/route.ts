import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchCursorUsage } from '@/lib/services/cursorService';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('cursor');
  if (cached) return NextResponse.json(cached);

  const data = await fetchCursorUsage();
  setCache('cursor', data);
  return NextResponse.json(data);
}
