// src/app/api/tokens/route.ts
import { NextResponse } from 'next/server'
import { brotliCompressSync, gzipSync } from 'node:zlib'

// NOTE: Your repo already exposes these from the refresh route.
// We reuse them so your in-memory 10-min cache keeps working.
import { getCachedTokenList, fetchAndCacheTokenList } from './refresh/route'

// Ensure we run in Node (so zlib is available)
export const runtime = 'nodejs'

// Tune these if you like
const EDGE_TTL_SECONDS = 60          // s-maxage for any CDN/proxy (harmless if none)
const BROWSER_MAX_AGE  = 300         // 5 minutes browser cache
const STALE_WHILE_REVAL = 300        // allow stale for 5 minutes while background revalidate

type Token = {
  mint: string
  symbol?: string
  name?: string
  decimals?: number
  icon?: string
  programId?: string | null
  tvlUsd?: number
  [k: string]: any
}

function toSlim(t: Token) {
  return {
    mint: t.mint,
    symbol: t.symbol ?? '',
    name: t.name ?? '',
    decimals: typeof t.decimals === 'number' ? t.decimals : 9,
    icon: t.icon ?? t.logoURI ?? t.logoUri ?? '',
    programId: t.programId ?? null,
    tvlUsd: typeof t.tvlUsd === 'number' ? t.tvlUsd : 0
  }
}

export async function GET(req: Request) {
  const started = performance.now()
  const url     = new URL(req.url)

  // Query params
  const fields  = (url.searchParams.get('fields') || 'slim').toLowerCase() // 'slim' | 'full'
  const limitQ  = url.searchParams.get('limit')
  const mintQ   = url.searchParams.get('mint')?.trim()
  const tvlMinQ = url.searchParams.get('tvlMin') // optional, many lists don't have tvl

  const limit   = Number.isFinite(Number(limitQ)) ? Math.max(0, parseInt(limitQ!, 10)) : 0
  const tvlMin  = Number.isFinite(Number(tvlMinQ)) ? Math.max(0, parseFloat(tvlMinQ!)) : 0

  // 1) get list from in-memory cache (fast path), else fill it
  let list: Token[] | null = await getCachedTokenList()
  if (!list || list.length === 0) {
    list = await fetchAndCacheTokenList()
  }

  // 2) filter/project
  let result: any

  if (mintQ) {
    // Single-mint lookup (case-insensitive)
    const needle = mintQ.toLowerCase()
    const hit = list.find(
      t => t.mint?.toLowerCase() === needle || t.address?.toLowerCase() === needle
    )
    if (!hit) {
      // Not found -> 404 so client .ok becomes false and skips
      const miss = NextResponse.json({ error: 'not_found' }, { status: 404 })
      attachTimingHeaders(miss, started, fields, 0, tvlMin, limit)
      return miss
    }
    result = fields === 'full' ? hit : toSlim(hit)
  } else {
    // Whole list flow
    let arr: Token[] = list

    // Optional TVL filter (many sources don't have tvl; harmless if 0)
    if (tvlMin > 0) {
      arr = arr.filter(t => (typeof t.tvlUsd === 'number' ? t.tvlUsd : 0) >= tvlMin)
    }

    // Project
    const projected = fields === 'full' ? arr : arr.map(toSlim)

    // Optional limit
    result = limit > 0 ? projected.slice(0, limit) : projected
  }

  // 3) respond (compressed if client accepts)
  const acceptEnc = (req.headers.get('accept-encoding') || '').toLowerCase()
  const bodyJson  = JSON.stringify(result)

  const res =
    acceptEnc.includes('br')
      ? new NextResponse(brotliCompressSync(Buffer.from(bodyJson)), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br' }
        })
      : acceptEnc.includes('gzip')
      ? new NextResponse(gzipSync(Buffer.from(bodyJson)), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }
        })
      : NextResponse.json(result)

  // Cache: let browsers reuse for a few minutes, plus sane proxy hints
  res.headers.set(
    'Cache-Control',
    `public, max-age=${BROWSER_MAX_AGE}, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVAL}`
  )
  res.headers.set('Vary', 'Accept-Encoding')

  attachTimingHeaders(
    res,
    started,
    fields,
    Array.isArray(result) ? result.length : 1,
    tvlMin,
    limit
  )

  return res
}

function attachTimingHeaders(
  res: NextResponse,
  started: number,
  fields: string,
  count: number,
  tvlMin: number,
  limit: number
) {
  const dur = (performance.now() - started).toFixed(1)
  res.headers.set('Server-Timing', `tokens;dur=${dur}`)
  res.headers.set('X-Fields', fields)
  res.headers.set('X-Tokens-Count', String(count))
  if (tvlMin > 0) res.headers.set('X-Tokens-TvlMin', String(tvlMin))
  if (limit  > 0) res.headers.set('X-Tokens-Limit', String(limit))
}
