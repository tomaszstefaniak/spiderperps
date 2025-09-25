/* eslint-disable no-restricted-globals */
/// <reference lib="webworker" />

/* ────────────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────────── */

export interface QuoteRequest {
  apiHost:     string
  swapV1Host:  string
  query:       string
  slippage:    number
  outDecimals: number
}

/** happy‐path shape sent back to the UI */
export interface QuoteSuccess {
  outRaw:      number
  priceImpact: string
  routeCount:  number
  minReceived: string
}

/** error shape sent back to the UI */
export interface QuoteError {
  error: string
}

export type QuoteResponse = QuoteSuccess | QuoteError

/* ────────────────────────────────────────────────────────────────────────────
   Worker main
   ────────────────────────────────────────────────────────────────────────── */

self.addEventListener(
  'message',
  async (e: MessageEvent<QuoteRequest>): Promise<void> => {
    const { apiHost, swapV1Host, query, slippage, outDecimals } = e.data

    try {
      /* fetch both versions in parallel */
      const [v0, v1] = await Promise.all([
        fetch(`${apiHost}/compute/swap-base-in?${query}`).then(r => r.json()),
        fetch(`${swapV1Host}/compute/swap-base-in?${query}`).then(r => r.json()),
      ])

      if (!v0.success) {
        throw new Error('V0 quote failed')
      }

      /* ----- normalised response ----- */
      const outRaw      = Number(v0.data.outputAmount ?? 0)
      const priceImpact = v1.success
        ? `${v1.data.priceImpactPct.toFixed(2)}%`
        : '0.00%'
      const routeCount  = v1.success ? v1.data.routePlan.length : 0

      /* slippage-adjusted minReceived (UI-friendly string) */
      const minRaw      = Math.floor(outRaw * (1 - slippage / 100))
      const minReceived = (minRaw / 10 ** outDecimals).toFixed(outDecimals)

      const resp: QuoteSuccess = {
        outRaw,
        priceImpact,
        routeCount,
        minReceived,
      }

      self.postMessage(resp as QuoteResponse)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const resp: QuoteError = { error: msg }
      self.postMessage(resp as QuoteResponse)
    }
  },
)

/* make this file a module so TS doesn’t treat it as a global script */
export {}
