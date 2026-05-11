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

export function dateKeyFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
