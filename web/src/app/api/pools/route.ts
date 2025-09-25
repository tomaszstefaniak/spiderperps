/*  /api/pools/route.ts  – served to browsers and the cron warmer
 *  ---------------------------------------------------
 *  – pulls Raydium pool pages until TVL drops below threshold
 *  – caches the resulting array in the in-memory LRU for 60 s
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { cache }        from '@/lib/cache';
import { getRaydium }   from '@/lib/raydium';
import { PoolFetchType } from '@raydium-io/raydium-sdk-v2';
import { MIN_POOL_TVL_USD } from '@/utils/config';

const CACHE_KEY  = 'pool-list';
const TTL_MS     = 60_000;        // 1 min
const PAGE_SIZE  = 1000;
const MAX_RETRY  = 3;
const BACKOFF_MS = 300;

function delay (ms: number) { return new Promise(r => setTimeout(r, ms)); }

/* ────────── core fetcher that returns a plain array ────────── */
export async function fetchPoolsData(): Promise<
  { id: string; baseMint: string; quoteMint: string }[]
> {
  const cached = cache.get(CACHE_KEY) as any[] | undefined;
  if (cached) return cached;

  const raydium = await getRaydium();
  const result: { id: string; baseMint: string; quoteMint: string }[] = [];
  let page = 1;

  while (true) {
    let data: any[] | null = null;

    /* simple retry with back-off */
    for (let i = 0; i < MAX_RETRY && !data; i++) {
      try {
        if (i) await delay(i * BACKOFF_MS);
        const resp = await raydium.api.getPoolList({
          type: PoolFetchType.Standard,
          pageSize: PAGE_SIZE,
          page,
        });
        data = resp.data as any[];
      } catch {
        if (i === MAX_RETRY - 1) throw new Error('Raydium upstream error');
      }
    }

    if (!data!.length) break;

    for (const p of data!) {
      if ((p.tvl ?? 0) > MIN_POOL_TVL_USD) {
        result.push({
          id       : p.id,
          baseMint : p.mintA.address,
          quoteMint: p.mintB.address,
        });
      }
    }

    /* stop paging once we see anything below the threshold */
    if (data!.some(p => (p.tvl ?? 0) <= MIN_POOL_TVL_USD)) break;
    page++;
  }

  cache.set(CACHE_KEY, result, { ttl: TTL_MS });
  return result;
}

/* ────────── HTTP handler ────────── */
export async function GET(_req: NextRequest) {
  try {
    const list = await fetchPoolsData();

    const res = NextResponse.json(list);
    res.headers.set(
      'Cache-Control',
      'public, max-age=60, s-maxage=300, stale-while-revalidate'
    );
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'unknown' },
      { status: 502 }
    );
  }
}
