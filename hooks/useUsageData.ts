'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AllUsageResponse } from '@/lib/types';

interface UsageDataOptions {
  cursorStart?: string;
  cursorEnd?: string;
}

function usageAllPath(options: UsageDataOptions) {
  const params = new URLSearchParams();
  if (options.cursorStart) params.set('cursorStart', options.cursorStart);
  if (options.cursorEnd) params.set('cursorEnd', options.cursorEnd);
  const query = params.toString();
  return `/api/usage/all${query ? `?${query}` : ''}`;
}

export function useUsageData(options: UsageDataOptions = {}) {
  const { cursorStart, cursorEnd } = options;
  const [data, setData] = useState<AllUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);
    try {
      const response = await fetch(usageAllPath({ cursorStart, cursorEnd }), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const json = (await response.json()) as AllUsageResponse;
      setData(json);
      setLastUpdated(new Date(json.fetchedAt));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [cursorEnd, cursorStart]);

  const refresh = useCallback(async () => {
    if (loadingRef.current || refreshing) return;
    loadingRef.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cursorStart,
          cursorEnd,
        }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
      const json = (await response.json()) as AllUsageResponse;
      setData(json);
      setLastUpdated(new Date(json.fetchedAt));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh usage data');
    } finally {
      setRefreshing(false);
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursorEnd, cursorStart, refreshing]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load();
    }, 0);
    const interval = window.setInterval(() => {
      void load();
    }, 300_000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  return { data, loading, refreshing, error, lastUpdated, refresh };
}
