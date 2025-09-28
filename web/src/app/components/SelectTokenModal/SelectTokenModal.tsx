'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SelectTokenModal.module.css';

type TokenBasic = {
  symbol: string;         // e.g. "USDC"
  name?: string;          // optional display name
  icon?: string | null;   // optional icon url
};

type Props = {
  visible: boolean;
  onClose(): void;
  onSelect(symbol: string): void;  // returns the chosen symbol (UPPERCASE)
  tokens: TokenBasic[];            // full token list
  balances: Record<string, number>; // symbol -> UI balance (number)
};

const POPULAR_DEFAULT = ['USDC', 'ETH', 'BTC'] as const;

function pretty(n: number, dp = 6) {
  const v = Number.isFinite(n) ? n : 0;
  if (v === 0) return '0';
  return v.toLocaleString(undefined, { maximumFractionDigits: dp });
}

function iconFor(t: TokenBasic) {
  const url = (t.icon || '').trim();
  if (url) return url;
  // fallback icons (change to your asset paths if you have them)
  if (t.symbol.toUpperCase() === 'USDC') return '/assets/usdc.png';
  if (t.symbol.toUpperCase() === 'ETH')  return '/assets/eth.png';
  return '/assets/token-fallback.png';
}

export default function SelectTokenModal({
  visible,
  onClose,
  onSelect,
  tokens,
  balances,
}: Props) {
  // close on ESC and lock page scroll while open
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [visible, onClose]);

  // search
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);
  const qLower = q.trim().toLowerCase();

  // normalize & attach balances
  const withBal = useMemo(() => {
    return tokens.map((t) => {
      const sym = (t.symbol || '').toUpperCase();
      return {
        ...t,
        symbol: sym,
        uiBal: Number(balances[sym] ?? 0),
      };
    });
  }, [tokens, balances]);

  // sort: USDC first, then owned (by balance desc), then alpha
  const sorted = useMemo(() => {
    const arr = withBal.slice();
    arr.sort((a, b) => {
      if (a.symbol === 'USDC' && b.symbol !== 'USDC') return -1;
      if (b.symbol === 'USDC' && a.symbol !== 'USDC') return 1;
      const ao = a.uiBal > 0 ? 1 : 0;
      const bo = b.uiBal > 0 ? 1 : 0;
      if (ao !== bo) return bo - ao;
      if (a.uiBal !== b.uiBal) return b.uiBal - a.uiBal;
      return a.symbol.localeCompare(b.symbol);
    });
    return arr;
  }, [withBal]);

  // filter by query
  const list = useMemo(() => {
    if (!qLower) return sorted;
    return sorted.filter((t) => {
      const sym = (t.symbol || '').toLowerCase();
      const name = (t.name || '').toLowerCase();
      return sym.includes(qLower) || name.includes(qLower);
    });
  }, [sorted, qLower]);

  // popular chips (only show ones present in tokens)
  const popular = useMemo(() => {
    const set = new Set(sorted.map(t => t.symbol));
    return POPULAR_DEFAULT.filter(s => set.has(s));
  }, [sorted]);

  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (visible) searchRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

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

        {/* search */}
        <input
          ref={searchRef}
          className={styles.searchInput}
          placeholder="Search token by symbol or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {/* popular row */}
        {!!popular.length && !qLower && (
          <div className={styles.popularRow}>
            {popular.map(sym => (
              <button
                key={sym}
                className={styles.popularChip}
                onClick={() => { onSelect(sym); onClose(); }}
              >
                <img src={iconFor({ symbol: sym })} alt={sym} />
                <span>{sym}</span>
              </button>
            ))}
          </div>
        )}

        {/* list */}
        <div className={styles.tokenList}>
          <div className={styles.scrollArea}>
            {list.map((t) => (
              <div
                key={t.symbol}
                className={styles.tokenItem}
                onClick={() => { onSelect(t.symbol); onClose(); }}
              >
                <img
                  src={iconFor(t)}
                  alt={t.symbol}
                  className={styles.tokenIcon}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/assets/token-fallback.png'; }}
                />
                <div className={styles.tokenInfo}>
                  <div className={styles.tokenRow}>
                    <span className={styles.tokenSymbol}>{t.symbol}</span>
                    {t.uiBal > 0 && (
                      <span className={styles.tokenBalance}>{pretty(t.uiBal)}</span>
                    )}
                  </div>
                  <div className={styles.tokenRowSecondary}>
                    <span className={styles.tokenName}>{t.name || '\u00A0'}</span>
                    {/* place for USD value if you add pricing later */}
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <p className={styles.noTokens}>No matching tokens.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
