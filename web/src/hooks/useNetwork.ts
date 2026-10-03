'use client';
import { useEffect, useState } from 'react';

export type NetworkKey = 'mainnet' | 'testnet' | 'unknown';
const LAST_NET_KEY = 'hl.lastNetwork';

/**
 * Returns 'mainnet' | 'testnet' | 'unknown'.
 * - Seeds initial value from localStorage (hl.lastNetwork) to avoid flicker.
 * - Persists the latest value back to localStorage for next reload.
 */
export function useNetwork(): NetworkKey {
  const [net, setNet] = useState<NetworkKey>(() => {
    if (typeof window === 'undefined') return 'unknown';
    const stored = window.localStorage.getItem(LAST_NET_KEY);
    return stored === 'mainnet' || stored === 'testnet' ? stored : 'unknown';
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'health error');
        const n = String(j?.network ?? '').toLowerCase();
        const key: NetworkKey =
          n === 'testnet' ? 'testnet'
        : n === 'mainnet' ? 'mainnet'
        : 'unknown';

        if (alive) {
          setNet(key);
          try { window.localStorage.setItem(LAST_NET_KEY, key); } catch {}
        }
      } catch {
        if (alive) {
          setNet(prev => {
            // keep whatever last known value we had (incl. sticky local value)
            try { window.localStorage.setItem(LAST_NET_KEY, prev); } catch {}
            return prev;
          });
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  return net;
}
