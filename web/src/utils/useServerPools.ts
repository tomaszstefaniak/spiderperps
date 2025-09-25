// src/utils/useServerPools.ts
import useSWR from 'swr';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
};

export function useServerPools() {
  const { data, error } = useSWR('/api/pools', fetcher, {
    refreshInterval: 300_000,
  });

  return {
    pools:   Array.isArray(data) ? data : [],
    loading: !data && !error,
    error,
  };
}
