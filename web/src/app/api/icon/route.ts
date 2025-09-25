// src/app/api/icon/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type CacheEntry = {
  buf: ArrayBuffer;
  ctype: string | null;
  t: number; // ms epoch
};

const MEM_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ITEMS  = 1000;
const mem = new Map<string, CacheEntry>();

function get(u: string) {
  const e = mem.get(u);
  if (!e) return null;
  if (Date.now() - e.t > MEM_TTL_MS) { mem.delete(u); return null; }
  return e;
}

function set(u: string, e: CacheEntry) {
  mem.set(u, e);
  // very simple LRU cap
  if (mem.size > MAX_ITEMS) {
    const k = mem.keys().next().value as string | undefined;
    if (k) mem.delete(k);
  }
}

const ALLOWED_HOSTS = new Set([
  'img-v1.raydium.io',
  'img.raydium.io',
  'raw.githubusercontent.com',
  'arweave.net',
  'ipfs.io',
  'gateway.pinata.cloud',
]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const u   = url.searchParams.get('u');
    if (!u) return NextResponse.json({ error: 'missing u' }, { status: 400 });

    let src: URL;
    try { src = new URL(u); } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }); }
    if (!ALLOWED_HOSTS.has(src.hostname)) {
      return NextResponse.json({ error: 'host_not_allowed' }, { status: 400 });
    }

    const hit = get(u);
    if (hit) {
      return new NextResponse(hit.buf, {
        status: 200,
        headers: {
          'Content-Type': hit.ctype ?? 'image/png',
          'Cache-Control': 'public, max-age=86400, immutable',
        }
      });
    }

    const upstream = await fetch(u, { cache: 'no-store' });
    if (!upstream.ok) {
      // cache a tiny 1x1 transparent PNG for 1h to avoid hammering on 404/429
      const emptyPng = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF6QJm8g3iNwAAAABJRU5ErkJggg=='),
        c => c.charCodeAt(0)
      ).buffer;
      set(u, { buf: emptyPng, ctype: 'image/png', t: Date.now() });
      return new NextResponse(emptyPng, {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }
      });
    }

    const ctype = upstream.headers.get('content-type');
    const buf   = await upstream.arrayBuffer();
    set(u, { buf, ctype, t: Date.now() });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': ctype ?? 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      }
    });
  } catch (e) {
    return NextResponse.json({ error: 'icon_proxy_failed' }, { status: 500 });
  }
}
