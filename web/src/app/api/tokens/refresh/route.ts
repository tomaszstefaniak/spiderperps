// src/app/api/tokens/refresh/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cache } from '@/lib/cache';

const RAYDIUM_LIST = 'https://api.raydium.io/v2/sdk/token/raydium.mainnet.json';
const JUP_META     = 'https://cache.jup.ag/token-metadata.json';

const ALLOWED_DECIMALS = new Set([6, 7, 8, 9]);
const CACHE_KEY = 'token-list';
const MEM_TTL   = 10 * 60_000; // 10 min

export type CombinedToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  tvlUsd?: number;
  priceUsd?: number;
};

export async function getCachedTokenList(): Promise<CombinedToken[] | null> {
  return (cache.get(CACHE_KEY) as CombinedToken[] | undefined) ?? null;
}

export async function fetchAndCacheTokenList(opts?: { force?: boolean }): Promise<CombinedToken[]> {
  if (!opts?.force) {
    const hit = cache.get(CACHE_KEY) as CombinedToken[] | undefined;
    if (hit?.length) return hit;
  }

  // 1) Raydium list
  const raw = await (await fetch(RAYDIUM_LIST)).json() as {
    official?: any[]; unOfficial?: any[];
  };

  let tokens: any[] = [
    ...(raw.official ?? []),
    ...(raw.unOfficial ?? []),
  ].filter(t => ALLOWED_DECIMALS.has(Number(t.decimals)));

  // 2) Jupiter metadata
  let meta: Record<string, { name?: string; symbol?: string; logoURI?: string }> = {};
  try {
    meta = await (await fetch(JUP_META)).json();
  } catch { /* ignore */ }

  // 3) Normalize to the UI shape
  const list: CombinedToken[] = tokens.map(t => {
    const m = meta[t.mint] ?? {};
    return {
      mint: String(t.mint),
      symbol: String(t.symbol || m.symbol || ''),
      name: String(t.name || m.name || ''),
      decimals: Number.isFinite(+t.decimals) ? +t.decimals : 9,
      icon: t.icon || t.logoURI || m.logoURI || undefined,
    };
  });

  // 4) Cache
  cache.set(CACHE_KEY, list, { ttl: MEM_TTL });
  return list;
}

// Cron-friendly ping
export async function GET() {
  try {
    const list = await fetchAndCacheTokenList();
    return NextResponse.json({ ok: true, count: list.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
