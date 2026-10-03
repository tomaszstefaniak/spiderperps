'use client';

import React, { useState } from 'react';
import { useBalances } from '@/hooks/useBalances';
import { useLiveMids } from '@/app/components/_shared/LiveMidsContext';
import styles from './PositionsTable.module.css';

const pretty = (n: number, dp = 4) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const signed = (n: number, dp = 2) =>
  `${n > 0 ? '+' : ''}${pretty(n, dp)}`;
const num = (x: any, d = 0) => {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
};

export default function PositionsTable() {
  const { positions, refresh } = useBalances();
  const mids = useLiveMids();
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
        <div className={styles.right}>Side</div>
        <div className={styles.right}>Size</div>
        <div className={`${styles.right} ${styles.hideSm}`}>Entry</div>
        <div className={styles.right}>Fair</div>
        <div className={styles.right}>Liq.</div>
        <div className={styles.right}>TP/SL</div>
        <div className={styles.right}>Lev.</div>
        <div className={styles.right}>Exposure (USDC)</div>
        <div className={styles.right}>uPnL (USDC)</div>
        <div></div>
      </div>

      <div className={styles.rows}>
        {positions.map((p: any) => {
          // Robust extraction across possible shapes { coin, szi, ... } or { position: {...} }
          const coin = String(p.coin ?? p.position?.coin ?? '').toUpperCase();
          const szi = num(p.szi ?? p.position?.szi ?? p.position?.sz ?? p.size);
          const entry = num(p.entryPx ?? p.position?.entryPx ?? p.position?.entry);
          const rowMark = num(
            p.markPx ?? p.indexPx ?? p.fairPx ?? p.position?.markPx ?? p.position?.indexPx
          );

          // live mark (fair): prefer mids; then any row mark; then 0
          const markFallback = rowMark;
          const fair = (mids[coin] ?? markFallback) ?? 0;

          // TP/SL if present on row
          const tp = num(p.tpPx ?? p.position?.tpPx ?? p.position?.tp);
          const sl = num(p.slPx ?? p.position?.slPx ?? p.position?.sl);
          const tpSlStr = tp || sl ? `${tp ? pretty(tp, 2) : '—'} / ${sl ? pretty(sl, 2) : '—'}` : '—';

          // exposure & uPnL live
          const notional = Math.abs(szi) * (fair || 0);

          // leverage: prefer provided leverage; else derive from margin;
          const marginUsd = num(
            p.marginUsd ?? p.collateralUsd ?? p.position?.marginUsd ?? p.position?.collateralUsd
          );
          const levProvided = num(p.leverage ?? p.position?.leverage);
          const lev = levProvided || (marginUsd > 0 && notional > 0 ? (notional / marginUsd) : 0);

          // very simple liq approximation: Pliq ~= entry * (1 ± (1/lev) ∓ mmr)
          const mmr = num(p.maintenanceMarginRatio ?? p.mmr, 0.005); // default 0.5%
          const liq =
            (lev > 0 && entry > 0)
              ? (szi >= 0
                  ? entry * (1 - 1 / Math.max(1, lev) + mmr)  // long
                  : entry * (1 + 1 / Math.max(1, lev) - mmr)) // short
              : 0;

          // prefer live mark for uPnL if we have enough info
          const upnlCalc = fair > 0 && entry > 0 ? (fair - entry) * szi : NaN;
          const upnl = Number.isFinite(upnlCalc)
            ? upnlCalc
            : num(p.unrealizedPnl ?? p.uPnl ?? p.position?.uPnl ?? p.position?.uPnlUsd);

          const sideLabel = szi > 0 ? 'Long' : szi < 0 ? 'Short' : '—';
          const sideClass = szi > 0 ? styles.green : szi < 0 ? styles.red : '';

          const iconUrl = `https://app.hyperliquid.xyz/coins/${coin}.svg`;

          return (
            <div key={coin} className={styles.row}>
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

              <div className={`${styles.num} ${sideClass}`}>{sideLabel}</div>
              <div className={`${styles.num} ${sideClass}`}>{pretty(szi, 6)}</div>

              <div className={`${styles.num} ${styles.hideSm}`}>{entry ? pretty(entry, 2) : '—'}</div>
              <div className={styles.num}>{fair ? pretty(fair, 2) : '—'}</div>
              <div className={styles.num}>{liq ? pretty(liq, 2) : '—'}</div>
              <div className={styles.num}>{tpSlStr}</div>
              <div className={styles.num}>{lev ? `${pretty(lev, 2)}×` : '—'}</div>
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
