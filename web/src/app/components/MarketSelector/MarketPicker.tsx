'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import styles from './MarketPicker.module.css';
import { nameForSymbol } from './symbolNames';
import Portal from '../_shared/Portal';

export default function MarketPicker({
  visible,
  value,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: string;
  options: string[];
  onClose(): void;
  onSelect(sym: string): void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [visible, onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => o.toLowerCase().includes(s));
  }, [q, options]);

  // Quick picks (BTC/ETH/SOL) if available
  const quickAll = ['BTC', 'ETH', 'SOL'];
  const optSet = useMemo(() => new Set(options.map(o => o.toUpperCase())), [options]);
  const quick = quickAll.filter(sym => optSet.has(sym));

  if (!visible) return null;

  return (
    <Portal>
      <div className={styles.overlay} onMouseDown={onClose}>
        <div
          className={styles.modal}
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Select a Market"
        >
          <div className={styles.header}>
            <h3>Select a Market</h3>
            <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
          </div>

          <input
            ref={inputRef}
            className={styles.search}
            placeholder="Search market…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {!!quick.length && (
            <div className={styles.quickRow}>
              {quick.map(sym => {
                const u = `https://app.hyperliquid.xyz/coins/${sym}.svg`;
                const active = sym.toUpperCase() === value.toUpperCase();
                return (
                  <button
                    key={sym}
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    onClick={() => onSelect(sym)}
                    title={nameForSymbol(sym)}
                  >
                    <img
                      src={u}
                      alt=""
                      className={styles.chipIcon}
                      onError={(e) => {
                        // Fallback to local unknown.svg
                        (e.currentTarget as HTMLImageElement).src = '/unknown.svg';
                      }}
                    />
                    <span>{sym}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.list}>
            {filtered.map((sym) => {
              const u = `https://app.hyperliquid.xyz/coins/${sym}.svg`;
              const active = sym.toUpperCase() === value.toUpperCase();
              const displayName = nameForSymbol(sym);
              return (
                <button
                  key={sym}
                  className={`${styles.row} ${active ? styles.active : ''}`}
                  onClick={() => onSelect(sym)}
                  title={sym}
                >
                  <img
                    src={u}
                    alt=""
                    className={styles.rowIcon}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/unknown.svg';
                    }}
                  />
                  <div className={styles.rowText}>
                    <div className={styles.rowSymbol}>{sym}</div>
                    <div className={styles.rowSub}>{displayName}</div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className={styles.empty}>No markets found.</div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
