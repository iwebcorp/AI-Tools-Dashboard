import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchClaudeUsage } from '@/lib/services/claudeService';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('claude');
  if (cached) return NextResponse.json(cached);

  const data = await fetchClaudeUsage();
  setCache('claude', data);
  return NextResponse.json(data);
}
