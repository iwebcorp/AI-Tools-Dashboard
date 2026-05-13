import { NextResponse } from 'next/server';
import { clearCache } from '@/lib/cache';

export async function POST(request: Request) {
  clearCache();
  const url = new URL('/api/usage/all', request.url);
  const body = (await request.json().catch(() => ({}))) as {
    cursorStart?: unknown;
    cursorEnd?: unknown;
  };
  if (typeof body.cursorStart === 'string') url.searchParams.set('cursorStart', body.cursorStart);
  if (typeof body.cursorEnd === 'string') url.searchParams.set('cursorEnd', body.cursorEnd);
  const response = await fetch(url, { cache: 'no-store' });
  return NextResponse.json(await response.json());
}
