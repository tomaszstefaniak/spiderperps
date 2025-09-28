/*  /api/jupiterPrices */

export const runtime  = 'edge';
export const dynamic  = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('ids');
  if (!raw) {
    return NextResponse.json(
      { error: 'Missing `ids` query parameter' },
      { status: 400 }
    );
  }
  const ids = Array.from(new Set(raw.split(',').filter(Boolean))).slice(0, 100);

  const url = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(
    ids.join(',')
  )}`;

  const apiRes = await fetch(url, { next: { revalidate: 30 } });

  if (!apiRes.ok) {
    // bubble-up so the client can retry later
    return NextResponse.json(
      { error: `Jupiter returned ${apiRes.status}` },
      { status: apiRes.status }
    );
  }

  type JupEntry   = { price?: number; usdPrice?: number };
  const records   = (await apiRes.json()) as Record<string, JupEntry>;

  const out: Record<string, { derivedPrice: number }> = {};
  for (const [mint, obj] of Object.entries(records)) {
    const p =
      typeof obj.price === 'number'
        ? obj.price
        : typeof obj.usdPrice === 'number'
        ? obj.usdPrice
        : undefined;

    if (p !== undefined) out[mint] = { derivedPrice: p };
  }

  return NextResponse.json(out, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate' },
  });
}
