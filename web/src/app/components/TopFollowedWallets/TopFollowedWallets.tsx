'use client';

import React, { useMemo } from 'react';
import styles from './TopFollowedWallets.module.css';
import { useWatchlist } from '@/app/context/WatchlistContext';

const topWallets: string[] = [
  '0x1234567890abcdef1234567890abcdef12345678',
  '0xabcdef1234567890abcdef1234567890abcdef12',
  '0xA1B2c3D4e5F6a7B8c9D0AaBbCcDdEeFf00112233',
  '0x0dD0123412341234123412341234123412340DD0',
  '0xFfEeDdCcBbAa0099887766554433221100AaBbCc',
];

const EXPLORER = 'https://app.hyperliquid.xyz/explorer/address/';
const shorten = (a: string) => a.slice(0, 6) + '...' + a.slice(-4);

export default function TopFollowedWallets() {
  const { list } = useWatchlist();

  // address->count (lowercased)
  const watchCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of list) {
      const k = w.address.toLowerCase();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [list]);

  // Bare content only (no internal header / no inner card)
  return (
    <div className={styles.listRows}>
      {topWallets.map((addr) => {
        const c = watchCounts.get(addr.toLowerCase()) ?? 0;
        return (
          <div key={addr} className={styles.walletRow}>
            <a
              href={EXPLORER + addr}
              target="_blank"
              rel="noreferrer"
              className={styles.link}
              title={addr}
            >
              {shorten(addr)}
            </a>
            <span
              className={`${styles.count} ${c > 0 ? styles.countActive : ''}`}
              aria-label={`${c} users following`}
              title={`${c} users following`}
            >
              {c}
            </span>
          </div>
        );
      })}
    </div>
  );
}
