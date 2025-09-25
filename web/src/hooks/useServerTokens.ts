import useSWR from 'swr';
import type { CombinedTokenInfo } from '@/app/context/TokenContext';

// const LIMIT = 4000;
// const RAY_TOKENS_URL = `/api/tokens?limit=${LIMIT}`;
const RAY_TOKENS_URL = `/api/tokens?limit`;

async function fetcher(): Promise<CombinedTokenInfo[]> {
  const raw = await fetch(RAY_TOKENS_URL).then((r) => r.json());

  return (Array.isArray(raw) ? raw : []).map((t: any) => ({
    mint:     t.mint   ?? t.address ?? '',
    symbol:   t.symbol,
    name:     t.name,
    decimals: t.decimals,
    icon:     (t.icon || t.logoURI || t.logoUri || undefined),
  }));
}

export function useServerTokens() {
  const { data, error } = useSWR<CombinedTokenInfo[]>(RAY_TOKENS_URL, fetcher, {
    revalidateOnFocus: false,
    refreshInterval:   15 * 60 * 1000,
  });

  return {
    tokens:  data ?? [],
    loading: !data && !error,
    error,
  };
}
