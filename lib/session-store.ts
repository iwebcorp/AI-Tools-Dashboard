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

function extractCursorAccountId(cookies: string): string | null {
  // 1. WorkosCursorSessionToken 쿠키 찾기
  const match = cookies.match(/WorkosCursorSessionToken=([^; ]+)/);
  if (!match) return null;
  
  try {
    const rawToken = match[1];
    // URL 인코딩 되어 있을 수 있으므로 디코딩
    const decodedToken = decodeURIComponent(rawToken);
    
    // 2. user_XXXX::eyJ... 또는 user_XXXX%3A%3AeyJ... 형태에서 ID 추출
    // 콜론(::) 앞부분이 사용자 고유 ID임
    const parts = decodedToken.split('::');
    if (parts[0] && parts[0].startsWith('user_')) {
      return parts[0];
    }
    
    // 만약 디코딩 전의 값에서 %3A%3A (::) 를 사용하는 경우 대응
    const altParts = rawToken.split('%3A%3A');
    if (altParts[0] && altParts[0].startsWith('user_')) {
      return altParts[0];
    }

    return parts[0] || null;
  } catch (e) {
    console.error('[SessionStore] Error parsing cursor account ID:', e);
    return null;
  }
}

function sessionKey(service: SyncedSessionService, accountId?: string): string {
  if (service === 'cursor' && accountId) {
    return `session:${service}:${accountId}`;
  }
  return `session:${service}`;
}

export async function getSyncedSessions(service: SyncedSessionService): Promise<SyncedSession[]> {
  const redis = getRedis();
  
  if (service === 'cursor') {
    // 다중 계정 키 조회
    const keys = await redis.keys(`session:${service}:*`);
    const sessions: SyncedSession[] = [];
    
    if (keys.length > 0) {
      const values = await Promise.all(keys.map(key => redis.get(key)));
      for (const value of values) {
        const parsed = syncedSessionSchema.safeParse(value);
        if (parsed.success) {
          sessions.push(parsed.data);
        }
      }
    }
    
    // 레거시 키 확인 (마이그레이션용)
    const legacyValue = await redis.get(`session:${service}`);
    const legacyParsed = syncedSessionSchema.safeParse(legacyValue);
    if (legacyParsed.success) {
      // 이미 다중 계정 목록에 없는 경우만 추가
      const legacyAccountId = extractCursorAccountId(legacyParsed.data.cookies);
      if (!sessions.some(s => extractCursorAccountId(s.cookies) === legacyAccountId)) {
        sessions.push(legacyParsed.data);
      }
    }
    
    return sessions;
  }
  
  // ChatGPT 등은 일단 단일 세션 유지 (추후 필요시 확장)
  const value = await redis.get(sessionKey(service));
  const parsed = syncedSessionSchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

export async function getSyncedSession(service: SyncedSessionService): Promise<SyncedSession | null> {
  const sessions = await getSyncedSessions(service);
  return sessions.length > 0 ? sessions[0] : null;
}

export async function setSyncedSession(session: SyncedSession): Promise<void> {
  const redis = getRedis();
  let accountId: string | undefined;
  
  if (session.service === 'cursor') {
    accountId = extractCursorAccountId(session.cookies) || undefined;
  }
  
  await redis.set(sessionKey(session.service, accountId), session);
}
