'use client'

import { useEffect, useRef, useState } from 'react'
import type { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'

export const NATIVE_SOL_KEY = 'NATIVE_SOL'

type ReturnShape = {
  /** ui string balances keyed by mint (plus NATIVE_SOL) */
  balanceMap: Record<string, string>
  /** decimals for each mint we discovered (if available) */
  decimalsMap: Record<string, number>
  loading: boolean
  error: any
}

/**
 * Reads wallet balances:
 * - Native SOL (keyed by NATIVE_SOL)
 * - SPL (Token v1) & Token-2022 program accounts (summed per mint)
 * Returns UI strings so the modal can render without BigInt math.
 */
export function useWalletBalances(
  connection: Connection | null | undefined,
  owner: PublicKey | null | undefined,
  opts?: { refreshMs?: number }
): ReturnShape {
  const refreshMs = opts?.refreshMs ?? 60_000

  const [balanceMap, setBalanceMap] = useState<Record<string, string>>({})
  const [decimalsMap, setDecimalsMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)

  const timerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function load() {
    if (!connection || !owner) {
      setBalanceMap({})
      setDecimalsMap({})
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Cancel any in-flight work
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      // 1) native SOL
      const lamports = await connection.getBalance(owner, 'confirmed')
      const solUi = (lamports / 1_000_000_000).toString()

      // 2) token accounts from both programs
      const [v1, v22] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'),
      ])

      const agg = new Map<string, { ui: number; dec: number }>()
      const addAccounts = (arr: typeof v1.value) => {
        for (const a of arr) {
          // parsed layout: account.data.parsed.info.*
          const parsed: any = a.account.data.parsed?.info
          if (!parsed) continue
          const mint: string = parsed.mint
          const tok = parsed.tokenAmount
          if (!mint || !tok) continue

          const dec = Number(tok.decimals ?? 0)
          // Prefer uiAmount when available; else derive
          const ui = typeof tok.uiAmount === 'number'
            ? tok.uiAmount
            : Number(tok.amount ?? 0) / Math.pow(10, dec)

          if (!agg.has(mint)) agg.set(mint, { ui: 0, dec })
          const entry = agg.get(mint)!
          entry.ui += ui
          entry.dec = entry.dec || dec
        }
      }

      addAccounts(v1.value)
      addAccounts(v22.value)

      // Build final maps (omit zeros)
      const nextBalances: Record<string, string> = { [NATIVE_SOL_KEY]: solUi }
      const nextDecimals: Record<string, number> = {}

      for (const [mint, { ui, dec }] of agg.entries()) {
        if (ui > 0) {
          nextBalances[mint] = ui.toString()
          nextDecimals[mint] = dec
        }
      }

      if (!ac.signal.aborted) {
        setBalanceMap(nextBalances)
        setDecimalsMap(nextDecimals)
        setLoading(false)
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        setError(e)
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    load()

    if (timerRef.current) window.clearInterval(timerRef.current)
    if (connection && owner) {
      timerRef.current = window.setInterval(load, refreshMs)
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, owner?.toBase58(), refreshMs])

  return { balanceMap, decimalsMap, loading, error }
}
