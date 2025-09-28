// src/hooks/useJupiterTokenPrices.ts
import useSWR from 'swr'

// simple JSON fetch helper
const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function useJupiterTokenPrices(mints: string[]) {
  // UI uses the pseudo‐key 'NATIVE_SOL', but Jupiter wants WSOL’s real mint
  const WSOL_MINT = 'So11111111111111111111111111111111111111112'
  const ids = mints
    .map((m) => (m === 'NATIVE_SOL' ? WSOL_MINT : m))
    .join(',')

  // fetch all prices in one shot
  const { data, error } = useSWR(
    mints.length > 0 ? `/api/jupiterPrices?ids=${ids}` : null,
    fetcher
  )

  // if no data or error, return empty map
  if (!data || error) return {}

  // build a Record<mint, price> converting back WSOL→NATIVE_SOL
  return Object.fromEntries(
    Object.entries(data).map(([mint, info]: [string, any]) => [
      // convert WSOL real mint back to our pseudo‐key so the selector can match it
      mint === WSOL_MINT ? 'NATIVE_SOL' : mint,
      // pick derivedPrice first, then price, else zero
      Number(info?.derivedPrice ?? 0)
    ])
  )
}
