// src/app/api/raydiumList/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';

const REMOTE_URL = 'https://api.raydium.io/v2/sdk/token/raydium.mainnet.json';
const LIST_PATH =
  process.env.RAYDIUM_LIST_PATH || path.join(process.cwd(), '.cache', 'raydium.mainnet.json');
const REFRESH_KEY = process.env.RAYDIUM_LIST_REFRESH_KEY || '';

let memCache: { ts: number; data: unknown } | null = null;
const MEM_TTL_MS = 15 * 60 * 1000; // 15 min

function respond(data: unknown, source: 'memory' | 'disk' | 'network' | 'fallback') {
  const h = new Headers({
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    'X-Raydium-Source': source,
    'X-Raydium-List-Path': LIST_PATH,
  });
  try {
    const st = statSync(LIST_PATH);
    h.set('X-Raydium-List-Size', String(st.size));
    h.set('X-Raydium-List-MTime', String(st.mtimeMs));
  } catch {}
  return NextResponse.json(data, { headers: h });
}

async function readFromDisk() {
  if (!existsSync(LIST_PATH)) return null;
  const raw = await fs.readFile(LIST_PATH, 'utf8');
  return JSON.parse(raw);
}
async function writeToDisk(jsonString: string) {
  await fs.mkdir(path.dirname(LIST_PATH), { recursive: true });
  await fs.writeFile(LIST_PATH, jsonString, 'utf8');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantsRefresh = url.searchParams.get('refresh') === '1';
  const key = url.searchParams.get('key') || '';

  // 1) memory
  if (memCache && Date.now() - memCache.ts < MEM_TTL_MS && !wantsRefresh) {
    return respond(memCache.data, 'memory');
  }

  // 2) disk
  if (!wantsRefresh) {
    const disk = await readFromDisk();
    if (disk) {
      memCache = { ts: Date.now(), data: disk };
      return respond(disk, 'disk');
    }
  }

  // 3) network (bootstrap or authorized refresh)
  if (wantsRefresh && REFRESH_KEY && key !== REFRESH_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const resp = await fetch(REMOTE_URL, { cache: 'no-store' });
  if (!resp.ok) {
    const fallback = await readFromDisk();
    if (fallback) {
      memCache = { ts: Date.now(), data: fallback };
      return respond(fallback, 'fallback');
    }
    return NextResponse.json({ error: `http_${resp.status}` }, { status: 502 });
  }

  const text = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const fallback = await readFromDisk();
    if (fallback) {
      memCache = { ts: Date.now(), data: fallback };
      return respond(fallback, 'fallback');
    }
    return NextResponse.json({ error: 'bad_json' }, { status: 502 });
  }

  await writeToDisk(text);
  memCache = { ts: Date.now(), data: json };
  return respond(json, 'network');
}
