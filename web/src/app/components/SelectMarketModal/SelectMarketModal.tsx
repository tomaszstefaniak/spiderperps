'use client';
import React, { useEffect, useMemo, useState } from 'react';
import styles from './SelectMarketModal.module.css';

type Props = {
  visible: boolean;
  onClose(): void;
  onSelect(sym: string): void;
  markets?: string[];
};

/* Minimal name map for popular symbols; extend freely */
const NAME_MAP: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', APT: 'Aptos', ATOM: 'Cosmos',
  MATIC: 'Polygon', BNB: 'BNB', AVAX: 'Avalanche', ARB: 'Arbitrum',
  OP: 'Optimism', APE: 'ApeCoin', DYDX: 'dYdX',
};

const iconFor = (sym: string) =>
  `https://app.hyperliquid.xyz/coins/${sym}.svg`;

export default function SelectMarketModal({ visible, onClose, onSelect, markets }: Props) {
  const [loaded, setLoaded] = useState<string[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible || markets) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/perps/market', { cache: 'no-store' });
        const j = await r.json();
        const arr: string[] = (j?.markets || []).filter(Boolean);
        if (alive) setLoaded(arr);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [visible, markets]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const source = markets && markets.length ? markets : loaded;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return source;
    return source.filter(m => m.toLowerCase().includes(s));
  }, [q, source]);

  if (!visible) return null;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h3>Select a Market</h3>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        <input
          className={styles.searchInput}
          placeholder="Search market…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className={styles.list}>
          {list.map((m) => {
            const sym = (m || '').toUpperCase();
            const name = NAME_MAP[sym] || sym;
            return (
              <button key={sym} className={styles.row} onClick={() => { onSelect(sym); onClose(); }}>
                <img
                  className={styles.icon}
                  src={iconFor(sym)}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <div className={styles.textCol}>
                  <div className={styles.symbol}>{sym}</div>
                  <div className={styles.name}>{name}</div>
                </div>
              </button>
            );
          })}
          {list.length === 0 && <p className={styles.empty}>No markets.</p>}
        </div>
      </div>
    </div>
  );
}
