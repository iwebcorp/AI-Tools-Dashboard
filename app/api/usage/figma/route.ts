import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchFigmaUsage } from '@/lib/services/figmaService';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('figma');
  if (cached) return NextResponse.json(cached);

  const data = await fetchFigmaUsage();
  setCache('figma', data);
  return NextResponse.json(data);
}
