import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/hl';

type Result<T> = { key: string; data: T | null; error: string | null };

/**
 * Load data when the screen is focused, optionally poll while focused, and expose a manual
 * refresh for pull-to-refresh. Results are tagged with `key`, so switching keys (e.g. a
 * different address) shows a loading state instead of stale data.
 */
export function useData<T>(load: () => Promise<T>, key: string, pollMs?: number) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  const keyRef = useRef(key);
  useEffect(() => {
    loadRef.current = load;
    keyRef.current = key;
  });

  const run = useCallback(async (manual = false) => {
    const forKey = keyRef.current;
    if (manual) setRefreshing(true);
    try {
      const data = await loadRef.current();
      setResult({ key: forKey, data, error: null });
    } catch (e) {
      setResult((prev) => ({ key: forKey, data: prev?.key === forKey ? prev.data : null, error: errorMessage(e) }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      run();
      if (!pollMs) return;
      const t = setInterval(run, pollMs);
      return () => clearInterval(t);
      // `key` re-runs the load for a new subject
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, pollMs, key]),
  );

  const current = result?.key === key ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    refreshing,
    refresh: () => run(true),
  };
}

/** Current unix time in seconds, ticking every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
