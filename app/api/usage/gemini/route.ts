import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchGeminiUsage } from '@/lib/services/geminiService';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('gemini');
  if (cached) return NextResponse.json(cached);

  const data = await fetchGeminiUsage();
  setCache('gemini', data);
  return NextResponse.json(data);
}
