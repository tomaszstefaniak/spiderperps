/* ------------------------------------------------------------------
   Lightweight, Edge-compatible cache
   – Pure Map (no Node-only modules)
   – Per-key TTL
   – Falls back to sensible defaults based on process.env.CACHE
   ----------------------------------------------------------------- */

type Entry<T> = { value: T; expire?: number }
const store = new Map<string, Entry<unknown>>()

/* Default TTLs the old code used --------------------------------- */
const DEFAULT_TTLS: Record<string, number> = {
  tokens: 5 * 60_000, //  5 min
  pools : 60_000,     // 60 sec
  quote : 15_000,     // 15 sec
}

/* Helper ­– pick the TTL for current env flag (or fallback) ------ */
function ttlForEnv(): number {
  const key = process.env.CACHE ?? 'tokens'
  return DEFAULT_TTLS[key] ?? DEFAULT_TTLS.tokens
}

/* --------------------------------------------------------------- */
export function get<T = unknown>(key: string): T | undefined {
  const hit = store.get(key)
  if (!hit) return
  if (hit.expire && Date.now() > hit.expire) {
    store.delete(key)
    return
  }
  return hit.value as T
}

export function set<T>(
  key: string,
  value: T,
  opts: { ttl?: number } = {},
): void {
  const ttl  = opts.ttl ?? ttlForEnv()
  const exp  = ttl > 0 ? Date.now() + ttl : undefined
  store.set(key, { value, expire: exp })
}

export const cache = { get, set }
