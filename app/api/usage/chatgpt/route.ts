import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';
import { fetchChatgptUsage } from '@/lib/services/chatgptService';
import type { ServiceUsage } from '@/lib/types';

export async function GET() {
  const cached = getCache<ServiceUsage>('chatgpt');
  if (cached) return NextResponse.json(cached);

  const data = await fetchChatgptUsage();
  setCache('chatgpt', data);
  return NextResponse.json(data);
}
