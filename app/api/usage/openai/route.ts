import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchOpenaiUsage } from '@/lib/services/openaiService';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('openai');
  if (cached) return NextResponse.json(cached);

  const data = await fetchOpenaiUsage();
  setCache('openai', data);
  return NextResponse.json(data);
}
