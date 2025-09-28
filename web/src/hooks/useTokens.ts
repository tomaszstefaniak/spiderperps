// src/hooks/useTokens.ts
'use client';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';

type Token = { symbol: string; szDecimals?: number; pxDecimals?: number };

export function useTokens() {
  const { data, error, isLoading } = useSWR('/api/tokens', jsonFetcher, { refreshInterval: 30_000 });
  return {
    tokens: (data?.tokens || []) as Token[],
    isLoading,
    error,
  };
}
