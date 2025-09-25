// src/app/api/quote/route.ts
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeApi } from '@/lib/withErrorHandling'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const inputMint   = searchParams.get('inputMint')
  const outputMint  = searchParams.get('outputMint')
  const amount      = searchParams.get('amount')
  const slippageBps = searchParams.get('slippageBps') || '100'
  const txVersion   = searchParams.get('txVersion')   || 'V0'
  const wrapSol     = searchParams.get('wrapSol')     || 'false'
  const unwrapSol   = searchParams.get('unwrapSol')   || 'false'

  if (!inputMint || !outputMint || !amount) {
    return NextResponse.json(
      { error: 'missing params' },
      { status: 400 }
    )
  }

  return safeApi(async () => {
    // build the exact query string that works in your curl tests
    const query = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps,
      txVersion,
      wrapSol,
      unwrapSol,
    }).toString()

    // v1 compute host (the one you verified with curl)
    const v1url = `https://transaction-v1.raydium.io/compute/swap-base-in?${query}`

    const r1 = await fetch(v1url).then(r => r.json())
    if (!r1.success) {
      console.error('V1 quote failed:', { r1, v1url })
      throw new Error('V1 quote failed')
    }

    const outRaw = Number(r1.data.outputAmount)
    return {
      outRaw,
      priceImpact: `${r1.data.priceImpactPct.toFixed(2)}%`,
      routeCount: r1.data.routePlan.length,
      // you can either use data.otherAmountThreshold or recalc minReceived here
      minReceived: r1.data.otherAmountThreshold.toString(),
    }
  })
}
