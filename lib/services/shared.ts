import type { ErrorCode, ServiceId, ServiceUsage } from '@/lib/types';

export function emptyUsage(
  service: ServiceId,
  error: ErrorCode = 'NOT_CONFIGURED',
  errorMessage = 'API credential is not configured.'
): ServiceUsage {
  return {
    service,
    connected: false,
    error,
    errorMessage,
    cost: { today: 0, thisMonth: 0 },
    tokens: { input: 0, output: 0, total: 0 },
    requests: 0,
    models: [],
    dailyHistory: [],
  };
}

export function monthRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(now);
  return { start, end };
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function dateKeyFromUnix(val: number | string): string {
  try {
    const date = typeof val === 'number' 
      ? new Date(val * (val > 10000000000 ? 1 : 1000)) // 밀리초인지 초인지 자동 판별
      : new Date(val);
    
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toISOString().slice(0, 10);
  } catch (e) {
    return new Date().toISOString().slice(0, 10); // 실패 시 오늘 날짜로 대체
  }
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
