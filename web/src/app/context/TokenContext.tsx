// src/app/context/TokenContext.tsx
'use client'

import React, { createContext, useContext, useMemo, ReactNode } from 'react'
import { useServerTokens } from '@/hooks/useServerTokens'

export interface CombinedTokenInfo {
  mint:     string
  symbol:   string
  name:     string
  decimals: number
  icon?:    string
}

export const NATIVE_SOL_KEY = 'NATIVE_SOL'
export const WSOL_MINT      = 'So11111111111111111111111111111111111111112'

const nativeSol: CombinedTokenInfo = {
  mint:     NATIVE_SOL_KEY,
  symbol:   'SOL',
  name:     'Solana',
  decimals: 9,
  icon:     '/assets/sol.png',
}

interface TokenContextValue {
  tokens:  CombinedTokenInfo[]
  loading: boolean
  error:   any
}

const TokenContext = createContext<TokenContextValue>({
  tokens:  [],
  loading: false,
  error:   null,
})

export const TokenProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    tokens: rayTokens = [],
    loading: loadingRay,
    error:   rayError,
  } = useServerTokens()

  // Merge + prepend native SOL
  const mergedTokens = useMemo<CombinedTokenInfo[]>(() => {
    const map = new Map<string, CombinedTokenInfo>()
    const add = (t?: CombinedTokenInfo) => {
      if (!t?.mint) return
      if (!map.has(t.mint)) map.set(t.mint, t)
    }
    add(nativeSol)
    rayTokens.forEach(add)
    return Array.from(map.values())
  }, [rayTokens])

  const loading = loadingRay && rayTokens.length === 0
  const error   = rayError

  return (
    <TokenContext.Provider value={{ tokens: mergedTokens, loading, error }}>
      {children}
    </TokenContext.Provider>
  )
}

export function useAllTokens() {
  return useContext(TokenContext)
}
