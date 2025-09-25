// src/app/components/SelectTokenModal/SelectTokenModal.tsx
'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import { CombinedTokenInfo, useAllTokens } from '@/app/context/TokenContext'
import { useDebounce } from '@/hooks/useDebounce'
import useJupiterTokenPrices from '@/hooks/useJupiterTokenPrices'
import { POPULAR_TOKENS } from '@/utils/config'
import styles from './SelectTokenModal.module.css'

/* ───────── constants ───────── */
const WSOL_MINT      = 'So11111111111111111111111111111111111111112'
const NATIVE_SOL_KEY = 'NATIVE_SOL'
const ITEM_HEIGHT    = 56

/* Decide what icon to show (use local SOL icon for SOL/WSOL) */
const iconSrcFor = (t: Pick<CombinedTokenInfo, 'mint' | 'icon'>) => {
  if (t.mint === NATIVE_SOL_KEY || t.mint === WSOL_MINT) return '/assets/sol.png'
  const url = (t.icon ?? '').trim()
  return url ? url : '/assets/token-fallback.png'
}
const hasIcon = (t: Pick<CombinedTokenInfo, 'mint' | 'icon'>) =>
  !!(t.icon && t.icon.trim().length > 0)

/* ───────── types ───────── */
type ExtendedToken = CombinedTokenInfo & {
  balance?: string
  uiAmount: number
  usdValue: number
}

export default function SelectTokenModal({
  visible,
  onClose,
  onSelect,
  balanceMap,
  poolMints,
}: {
  visible: boolean
  onClose(): void
  onSelect(t: CombinedTokenInfo): void
  balanceMap: Record<string, string>
  poolMints?: Set<string>
}) {
  /* close on ESC */
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  /* ───────── search box ───────── */
  const [searchText, setSearchText] = useState('')
  const debounced = useDebounce(searchText, 200)

  /* ───────── base registry (server) ───────── */
  const { tokens: registry, loading: loadingRegistry } = useAllTokens()

  /* Fetch minimal metadata for wallet mints missing from registry */
  const [extraTokens, setExtraTokens] = useState<CombinedTokenInfo[]>([])
  useEffect(() => {
    if (!visible) return
    const present = new Set(registry.map(t => t.mint))
    const missing = Object.keys(balanceMap || {})
      .filter(m => m !== NATIVE_SOL_KEY && !present.has(m))

    if (missing.length === 0) { setExtraTokens([]); return }

    let cancelled = false
    ;(async () => {
      const fetched: CombinedTokenInfo[] = []
      for (const mint of missing) {
        try {
          const r = await fetch(`/api/tokens?mint=${mint}`)
          if (r.ok) {
            const d = await r.json()
            fetched.push({
              mint:     d.mint ?? mint,
              symbol:   d.symbol ?? mint.slice(0, 4).toUpperCase(),
              name:     d.name   ?? `Token ${mint.slice(0, 4)}`,
              decimals: typeof d.decimals === 'number' ? d.decimals : 9,
              icon:     d.icon ?? d.logoURI ?? d.logoUri ?? undefined,
            })
          }
        } catch {/* ignore */}
      }
      if (!cancelled) setExtraTokens(prev => {
        const map = new Map(prev.map(t => [t.mint, t]))
        fetched.forEach(t => { if (!map.has(t.mint)) map.set(t.mint, t) })
        return Array.from(map.values())
      })
    })()

    return () => { cancelled = true }
  }, [visible, balanceMap, registry])

  /* registry + extras (dedup) */
  const mergedRegistry = useMemo<CombinedTokenInfo[]>(() => {
    const map = new Map<string, CombinedTokenInfo>()
    for (const t of registry) map.set(t.mint, t)
    for (const t of extraTokens) if (!map.has(t.mint)) map.set(t.mint, t)
    return Array.from(map.values())
  }, [registry, extraTokens])

  /* attach balances */
  const tokensWithBal = useMemo<ExtendedToken[]>(() =>
    mergedRegistry.map(t => {
      const raw = t.mint === WSOL_MINT
        ? balanceMap[NATIVE_SOL_KEY]
        : (balanceMap[t.mint] ?? (t.mint === NATIVE_SOL_KEY ? balanceMap[NATIVE_SOL_KEY] : undefined))
      const ui  = raw ? parseFloat(raw) : 0
      return { ...t, balance: raw, uiAmount: ui, usdValue: 0 }
    }),
    [mergedRegistry, balanceMap]
  )

  /* own vs others */
  const owned  = useMemo(() => tokensWithBal.filter(t => t.uiAmount > 0), [tokensWithBal])
  const others = useMemo(() => tokensWithBal.filter(t => t.uiAmount === 0), [tokensWithBal])

  /* price lookup only for owned mints — include WSOL so SOL gets priced */
  const priceIds = useMemo(() => {
    const s = new Set<string>([WSOL_MINT])
    for (const t of owned) s.add(t.mint === NATIVE_SOL_KEY ? WSOL_MINT : t.mint)
    return Array.from(s)
  }, [owned])

  const rawPrices = useJupiterTokenPrices(priceIds)
  const getPrice = (mint: string) => {
    const id = mint === NATIVE_SOL_KEY ? WSOL_MINT : mint
    return rawPrices[id] ?? rawPrices[id.toLowerCase()] ?? rawPrices[WSOL_MINT] ?? rawPrices[WSOL_MINT.toLowerCase()] ?? 0
  }

  /* Ensure any wallet-owned mint appears even before metadata is known */
  const walletOwnedStubs = useMemo<ExtendedToken[]>(() => {
    const present = new Set(mergedRegistry.map(t => t.mint))
    return Object.entries(balanceMap)
      .filter(([mint, raw]) => mint !== NATIVE_SOL_KEY && parseFloat(raw || '0') > 0 && !present.has(mint))
      .map(([mint, raw]) => ({
        mint,
        symbol:   mint.slice(0, 4).toUpperCase(),
        name:     `Token ${mint.slice(0, 4)}`,
        decimals: 9,
        icon:     undefined,
        balance:  raw,
        uiAmount: parseFloat(raw || '0'),
        usdValue: 0
      }))
  }, [mergedRegistry, balanceMap])

  /* add usdValue (use WSOL price for native SOL); include stubs up front */
  const tokensWithUsd = useMemo<ExtendedToken[]>(
    () => [
      ...walletOwnedStubs,
      ...owned.map(t => ({ ...t, usdValue: getPrice(t.mint) * t.uiAmount })),
      ...others
    ],
    [walletOwnedStubs, owned, others, rawPrices]
  )

  /* Fallback: if poolMints is missing/empty, include ALL tokens (minus WSOL) */
  const useAllTokensFallback = !poolMints || poolMints.size === 0

  /* default list:
     - always show owned (even if icon missing)
     - for unowned tokens, hide icon-less to keep the UI light
  */
  const sanitizedDefaultList = useMemo<ExtendedToken[]>(
    () =>
      tokensWithUsd.filter(t =>
        t.mint !== WSOL_MINT && (
          t.uiAmount > 0 ||
          (
            (useAllTokensFallback || poolMints?.has(t.mint) || POPULAR_TOKENS.has(t.mint))
            && (hasIcon(t) || t.mint === NATIVE_SOL_KEY)
          )
        )
      ),
    [tokensWithUsd, poolMints, useAllTokensFallback]
  )

  /* ---------- lightweight substring search (no worker) ---------- */
  const filteredSimple = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return null
    const hay = sanitizedDefaultList

    // exact match by symbol or mint first
    const exact = hay.filter(t =>
      (t.symbol && t.symbol.toLowerCase() === q) || t.mint.toLowerCase() === q
    )
    if (exact.length) return exact

    // substring fallback
    return hay.filter(t => {
      const sym  = (t.symbol ?? '').toLowerCase()
      const name = (t.name ?? '').toLowerCase()
      const mint = t.mint.toLowerCase()
      return sym.includes(q) || name.includes(q) || mint.includes(q)
    })
  }, [debounced, sanitizedDefaultList])

  /* on-demand fetch for base58 mints with hard de-dupe */
  const [remoteToken, setRemoteToken] = useState<ExtendedToken | null>(null)
  const lastFetchRef = useRef<string>('')
  const presentMints = useMemo(() => new Set(sanitizedDefaultList.map(t => t.mint)), [sanitizedDefaultList])

  useEffect(() => {
    const q = debounced.trim()
    setRemoteToken(null)
    if (!q) return
    const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)
    if (!base58) return
    if (presentMints.has(q)) return
    if (lastFetchRef.current === q) return
    lastFetchRef.current = q

    const ac = new AbortController()
    ;(async () => {
      try {
        const r = await fetch(`/api/tokens?mint=${q}`, { signal: ac.signal })
        if (!r.ok) return
        const d = await r.json()
        const raw = d.mint === WSOL_MINT ? balanceMap[NATIVE_SOL_KEY] : balanceMap[d.mint]
        const ui  = raw ? parseFloat(raw) : 0
        setRemoteToken({
          mint: d.mint,
          symbol: d.symbol ?? '',
          name: d.name ?? '',
          decimals: d.decimals ?? 9,
          icon: d.icon ?? d.logoURI ?? d.logoUri ?? '',
          balance: raw,
          uiAmount: ui,
          usdValue: 0,
        })
      } catch {/* ignore */}
    })()
    return () => ac.abort()
  }, [debounced, presentMints, balanceMap])

  /* choose what to show */
  const listData = useMemo(() => {
    if (debounced) {
      if (filteredSimple && filteredSimple.length) return filteredSimple
      if (remoteToken) return [remoteToken]
      return []
    }
    return sanitizedDefaultList
  }, [debounced, filteredSimple, remoteToken, sanitizedDefaultList])

  /* build “popular” chip row */
  const popular = useMemo(() => {
    return Array.from(POPULAR_TOKENS)
      .map(addr => {
        if (addr === WSOL_MINT) {
          return mergedRegistry.find(t => t.mint === WSOL_MINT || t.mint === NATIVE_SOL_KEY)
        }
        return mergedRegistry.find(t => t.mint === addr)
      })
      .filter(Boolean) as CombinedTokenInfo[]
  }, [mergedRegistry])

  const listWrapRef = useRef<HTMLDivElement | null>(null)
  const [listHeight, setListHeight] = useState(300)
  useEffect(() => {
    if (!visible) return
    const el = listWrapRef.current
    if (!el) return
    const ro = new (window as any).ResizeObserver((entries: any[]) => {
      const h = entries[0]?.contentRect?.height ?? 0
      setListHeight(Math.max(240, Math.floor(h)))
    })
    ro.observe(el)
    setListHeight(Math.max(240, Math.floor(el.getBoundingClientRect().height)))
    return () => ro.disconnect()
  }, [visible])

  /* early exits */
  if (!visible) return null
  if (loadingRegistry && !registry.length) {
    return (
      <div className={styles.selectTokenOverlay} onMouseDown={onClose}>
        <div
          className={styles.selectTokenModal}
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Loading"
        >
          <div className={styles.modalHeader}>
            <button onClick={onClose} className={styles.closeButton}>✕</button>
          </div>
          <p className={styles.loadingBody}>Preparing token list…</p>
        </div>
      </div>
    )
  }

  /* row renderer (virtualized) */
  const Row = ({ index, style, data }: ListChildComponentProps<ExtendedToken[]>) => {
    const t = data[index]
    return (
      <div
        key={t.mint}
        style={style}
        className={styles.tokenItem}
        onClick={() => { onSelect(t); onClose() }}
      >
        <img
          src={iconSrcFor(t)}
          alt={t.symbol}
          width={24}
          height={24}
          className={styles.tokenIcon}
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.src = '/assets/token-fallback.png' }}
        />
        <div className={styles.tokenInfo}>
          <div className={styles.tokenRow}>
            <span className={styles.tokenSymbol}>{t.symbol}</span>
            {t.uiAmount > 0 && <span className={styles.tokenBalance}>{t.uiAmount.toFixed(6)}</span>}
          </div>
          <div className={styles.tokenRowSecondary}>
            <span className={styles.tokenName}>{t.name}</span>
            {t.uiAmount > 0 && t.usdValue > 0 && (
              <span className={styles.tokenUsd}>${t.usdValue.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  const itemKey = (index: number, data: ExtendedToken[]) => data[index].mint

  /* ───────── JSX ───────── */
  return (
    <div className={styles.selectTokenOverlay} onMouseDown={onClose}>
      <div
        className={styles.selectTokenModal}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select a Token"
      >
        {/* header */}
        <div className={styles.modalHeader}>
          <h3>Select a Token</h3>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        {/* search box */}
        <input
          className={styles.searchInput}
          placeholder='Search token by symbol, name, or address…'
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />

        {/* popular tokens */}
        {!!popular.length && !debounced && (
          <div className={styles.popularRow}>
            {popular.map(tok => (
              <button
                key={tok.mint}
                className={styles.popularChip}
                onClick={() => { onSelect(tok); onClose() }}
              >
                <img
                  src={iconSrcFor(tok)}
                  alt={tok.symbol}
                  width={18}
                  height={18}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.src = '/assets/token-fallback.png' }}
                />
                <span>{tok.symbol}</span>
              </button>
            ))}
          </div>
        )}

        {/* list wrapper (react-window owns scrolling) */}
        <div className={styles.tokenList} ref={listWrapRef}>
          <List
            className={styles.scrollArea}
            height={listHeight}
            itemCount={listData.length}
            itemSize={ITEM_HEIGHT}
            width="100%"
            itemData={listData}
            itemKey={itemKey}
          >
            {Row}
          </List>
          {listData.length === 0 && (
            <p className={styles.noTokens}>No matching tokens.</p>
          )}
        </div>
      </div>
    </div>
  )
}
