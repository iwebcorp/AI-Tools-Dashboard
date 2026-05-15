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

  const load = useCallback(async (isManualRefresh = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);
    try {
      const path = usageAllPath({ cursorStart, cursorEnd });
      const separator = path.includes('?') ? '&' : '?';
      const refreshParam = isManualRefresh ? `${separator}refresh=true` : '';
      
      const response = await fetch(`${path}${refreshParam}`, { cache: 'no-store' });
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
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load, refreshing]);

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
