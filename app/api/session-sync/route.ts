import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSyncedSession, syncedSessionSchema } from '@/lib/session-store';

const sessionSyncBodySchema = syncedSessionSchema.extend({
  bearer: z.string().optional().or(z.literal('')),
  userAgent: z.string().optional().or(z.literal('')),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sync-secret',
};

function withCors(response: NextResponse) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

function jsonError(status: number, code: string, message: string) {
  return withCors(NextResponse.json({ ok: false, code, message }, { status }));
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.SYNC_SECRET;
  if (!expectedSecret) {
    return jsonError(500, 'INVALID_SECRET', 'SYNC_SECRET is not configured on the server.');
  }

  const secret = request.headers.get('x-sync-secret');
  if (secret !== expectedSecret) {
    return jsonError(401, 'INVALID_SECRET', 'Invalid sync secret.');
  }

  const json = await request.json().catch(() => null);
  if (!json) {
    return jsonError(400, 'INVALID_BODY', 'Request body must be valid JSON.');
  }

  const parsed = sessionSyncBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, 'INVALID_BODY', 'Missing or invalid session fields.');
  }

  try {
    await setSyncedSession({
      ...parsed.data,
      bearer: parsed.data.bearer || undefined,
      userAgent: parsed.data.userAgent || undefined,
    });
  } catch {
    return jsonError(500, 'REDIS_ERROR', 'Failed to store session.');
  }

  return withCors(
    NextResponse.json({
      ok: true,
      service: parsed.data.service,
      updatedAt: parsed.data.updatedAt,
    })
  );
}
