import { NextResponse } from 'next/server';

// Safe fallback map (tune as you wish)
const FALLBACK: Record<string, number> = {
  BTC: 40,
  ETH: 25,
  SOL: 20,
  PUMP: 10,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sym = (searchParams.get('symbol') || '').toUpperCase();

  // Best-effort live fetch (won’t crash on failure; we fall back)
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
      // cache a bit so we don't hammer their API
      next: { revalidate: 300 },
    });

    if (r.ok) {
      const j = await r.json();
      // Try a few plausible shapes defensively:
      const items: any[] =
        j?.perpMarkets ?? j?.perpProducts ?? j?.assets ?? j?.universe ?? [];

      const found = items.find((it) => {
        const code =
          (it?.name ?? it?.symbol ?? it?.asset ?? it?.id ?? '')
            .toString()
            .toUpperCase();
        return code === sym;
      });

      const live = Number(
        found?.maxLeverage ?? found?.max_leverage ?? found?.maxLev ?? NaN
      );
      if (!Number.isNaN(live) && live > 0) {
        return NextResponse.json({ symbol: sym, max: live, source: 'live' });
      }
    }
  } catch {
    // ignore; use fallback below
  }

  return NextResponse.json({
    symbol: sym,
    max: FALLBACK[sym] ?? 10,
    source: 'fallback',
  });
}
