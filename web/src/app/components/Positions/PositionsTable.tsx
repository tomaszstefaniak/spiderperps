'use client';

import React, { useState } from 'react';
import { useBalances } from '@/hooks/useBalances';
import styles from './PositionsTable.module.css';

const pretty = (n: number, dp = 4) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const signed = (n: number, dp = 2) =>
  `${n > 0 ? '+' : ''}${pretty(n, dp)}`;

export default function PositionsTable() {
  const { positions, refresh } = useBalances();
  const [busyOid, setBusyOid] = useState<string | null>(null);

  const closePos = async (coin: string, szi: number) => {
    if (!szi) return;
    setBusyOid(coin);
    try {
      const side = szi > 0 ? 'sell' : 'buy';
      const size = Math.abs(szi);
      const r = await fetch('/api/perps/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coin, side, size, slippage: 0.01 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || j?.detail || `HTTP ${r.status}`);
      setTimeout(() => refresh(), 600);
    } catch (e) {
      console.error('close failed', e);
      alert((e as any)?.message || 'Close failed');
    } finally {
      setBusyOid(null);
    }
  };

  if (!positions.length) {
    return <div className={styles.empty}>No open positions.</div>;
  }

  return (
    <div className={styles.table}>
      {/* Headers */}
      <div className={styles.headerRow}>
        <div>Market</div>
        <div className={styles.right}>Size</div>
        <div className={`${styles.right} ${styles.hideSm}`}>Entry</div>
        <div className={styles.right}>Mark</div>
        <div className={styles.right}>Exposure (USDC)</div>
        <div className={styles.right}>uPnL (USDC)</div>
        <div></div>
      </div>

      <div className={styles.rows}>
        {positions.map((p) => {
          const coin = String(p.coin || '').toUpperCase();
          const szi = Number(p.szi || 0);
          const entry = Number(p.entryPx || 0);
          const mark = Number(p.markPx || p.indexPx || 0);
          const notional = Math.abs(szi) * (mark || 0);
          const upnl = Number(p.unrealizedPnl || 0);
          const signColor = szi > 0 ? styles.green : szi < 0 ? styles.red : '';

          const iconUrl = `https://app.hyperliquid.xyz/coins/${coin}.svg`;

          return (
            <div key={p.coin} className={styles.row}>
              <div className={styles.marketCell}>
                <img
                  className={styles.coinIcon}
                  src={iconUrl}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <span>{coin}</span>
              </div>

              <div className={`${styles.num} ${signColor}`}>{pretty(szi, 6)}</div>
              <div className={`${styles.num} ${styles.hideSm}`}>{entry ? pretty(entry, 2) : '—'}</div>
              <div className={styles.num}>{mark ? pretty(mark, 2) : '—'}</div>
              <div className={styles.num}>{notional ? pretty(notional, 2) : '—'}</div>
              <div className={`${styles.num} ${upnl >= 0 ? styles.green : styles.red}`}>
                {signed(upnl, 2)}
              </div>
              <div className={styles.actCell}>
                <button
                  className={styles.smallPill}
                  onClick={() => closePos(coin, szi)}
                  disabled={busyOid === coin}
                  title="Close position"
                >
                  {busyOid === coin ? 'Closing…' : 'Close'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
