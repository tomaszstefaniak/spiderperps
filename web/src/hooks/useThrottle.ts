// src/hooks/useThrottle.ts
import { useRef, useCallback } from 'react';

/**
 * Returns a throttled version of `fn` that can only run once per `wait` ms.
 * It fires immediately on the first call (leading), then ignores further calls
 * until `wait` has elapsed.
 */
export function useThrottle<T extends (...args: any[]) => any>(fn: T, wait: number): T {
  const lastRef = useRef(0);
  return useCallback(((...args: any[]) => {
    const now = Date.now();
    if (now - lastRef.current >= wait) {
      lastRef.current = now;
      fn(...args);
    }
  }) as T, [fn, wait]);
}
