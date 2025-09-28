// src/hooks/useBalances.ts
'use client';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';

export function useBalances() {
  const { data, error, isLoading, mutate } = useSWR('/api/balances', jsonFetcher, { refreshInterval: 15_000 });

  // Normalize HL responses (spot_user_state OR user_state fallback)
  const map: Record<string, number> = {};
  try {
    if (Array.isArray(data?.balances) && data.balances.length) {
      // spot style: [{ coin, available }, ...]
      for (const b of data.balances) {
        const sym = String(b.coin || b.symbol || '').toUpperCase();
        const avail = Number(b.available ?? b.amount ?? 0);
        if (sym) map[sym] = (map[sym] || 0) + avail;
      }
    } else if (Array.isArray(data?.assetPositions)) {
      // user_state fallback: positions + withdrawable USDC
      for (const p of data.assetPositions) {
        const coin = String(p?.position?.coin || '').toUpperCase();
        const szi = Number(p?.position?.szi || 0);
        if (coin) map[coin] = szi; // may be negative if short
      }
      if (data?.withdrawable) map['USDC'] = Number(data.withdrawable);
    }
  } catch {
    // ignore parse errors
  }

  return { balances: map, isLoading, error, refresh: mutate };
}
