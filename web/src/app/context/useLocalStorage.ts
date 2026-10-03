'use client';
import { useEffect, useRef, useState } from 'react';

/** SSR-safe localStorage state with JSON serialization + cross-tab sync */
export function useLocalStorage<T>(key: string, initial: T) {
  const isHydrated = useRef(false);
  const [state, setState] = useState<T>(initial);

  // hydrate once
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) setState(JSON.parse(raw));
    } catch {}
    isHydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist
  useEffect(() => {
    if (!isHydrated.current) return;
    try { window.localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);

  // cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try { setState(JSON.parse(e.newValue)); } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [state, setState] as const;
}
