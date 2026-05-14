import 'server-only';

import { z } from 'zod';
import { getRedis } from '@/lib/redis';

export const syncedSessionServiceSchema = z.enum(['cursor', 'chatgpt']);

export const syncedSessionSchema = z.object({
  service: syncedSessionServiceSchema,
  cookies: z.string().min(1),
  bearer: z.string().optional(),
  userAgent: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export type SyncedSessionService = z.infer<typeof syncedSessionServiceSchema>;
export type SyncedSession = z.infer<typeof syncedSessionSchema>;

function sessionKey(service: SyncedSessionService): string {
  return `session:${service}`;
}

export async function getSyncedSession(service: SyncedSessionService): Promise<SyncedSession | null> {
  const redis = getRedis();
  const value = await redis.get(sessionKey(service));
  const parsed = syncedSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function setSyncedSession(session: SyncedSession): Promise<void> {
  const redis = getRedis();
  await redis.set(sessionKey(session.service), session);
}
