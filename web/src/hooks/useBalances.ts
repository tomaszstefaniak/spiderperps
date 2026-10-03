// src/hooks/useBalances.ts
'use client';

import useSWR from 'swr';

import { useWallet } from '@/app/context/WalletContext';
import { loadAccount, type Account } from '@/lib/hl-browser';

const EMPTY: Account = { equity: 0, withdrawable: 0, positions: [] };

/** The connected wallet's Hyperliquid account, read directly from Hyperliquid and refreshed every 5s. */
export function useBalances() {
  const { address } = useWallet();
  const { data, error, mutate } = useSWR(address ? ['account', address] : null, () => loadAccount(address as `0x${string}`), {
    refreshInterval: 5000,
  });
  return {
    ...(data ?? EMPTY),
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    refresh: async () => {
      await mutate();
    },
  };
}
