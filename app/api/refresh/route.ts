import { NextResponse } from 'next/server';
import { clearCache } from '@/lib/cache';

export async function POST(request: Request) {
  clearCache();
  const url = new URL('/api/usage/all', request.url);
  const response = await fetch(url, { cache: 'no-store' });
  return NextResponse.json(await response.json());
}
