'use client';

import React, { useState } from 'react';

import { useWallet } from '@/app/context/WalletContext';
import { useLiveMids } from '@/app/components/_shared/LiveMidsContext';
import { useBalances } from '@/hooks/useBalances';
import { isUnknownAgentError, loadAgent, loadMarkets, placeMarketOrder } from '@/lib/hl-browser';

import styles from './PositionsTable.module.css';

const pretty = (n: number, dp = 4) => (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const signed = (n: number, dp = 2) => `${n > 0 ? '+' : ''}${pretty(n, dp)}`;

/** The connected wallet's open positions, with a reduce-only "Close" signed in the browser. */
export default function PositionsTable() {
  const { address } = useWallet();
  const { positions, refresh } = useBalances();
  const mids = useLiveMids();
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = async (coin: string, szi: number) => {
    const agent = address ? loadAgent(address) : null;
    if (!agent) {
      setError('Enable trading on the order ticket first.');
      return;
    }
    setClosing(coin);
    setError(null);
    try {
      const market = (await loadMarkets()).find((m) => m.name === coin);
      const mid = mids[coin];
      if (!market || !mid) throw new Error(`${coin} isn't tradable right now`);
      await placeMarketOrder({ agent, market, isBuy: szi < 0, size: Math.abs(szi), mid, slippage: 0.01, reduceOnly: true });
      setTimeout(refresh, 750);
    } catch (e) {
      setError(isUnknownAgentError(e) ? 'Trading key was revoked; enable trading again.' : e instanceof Error ? e.message : String(e));
    } finally {
      setClosing(null);
    }
  };

  if (!address) return <div className={styles.empty}>Connect a wallet to see your positions.</div>;
  if (!positions.length) return <div className={styles.empty}>No open positions.</div>;

  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        <div>Market</div>
        <div className={styles.right}>Side</div>
        <div className={styles.right}>Size</div>
        <div className={`${styles.right} ${styles.hideSm}`}>Entry</div>
        <div className={styles.right}>Mark</div>
        <div className={styles.right}>Liq.</div>
        <div className={styles.right}>Lev.</div>
        <div className={styles.right}>Value (USDC)</div>
        <div className={styles.right}>uPnL (USDC)</div>
        <div></div>
      </div>

      <div className={styles.rows}>
        {positions.map((p) => {
          const mark = mids[p.coin] ?? 0;
          const side = p.szi > 0 ? styles.green : styles.red;
          return (
            <div key={p.coin} className={styles.row}>
              <div className={styles.marketCell}>
                <img
                  className={styles.coinIcon}
                  src={`https://app.hyperliquid.xyz/coins/${p.coin}.svg`}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span>{p.coin}</span>
              </div>
              <div className={`${styles.num} ${side}`}>{p.szi > 0 ? 'Long' : 'Short'}</div>
              <div className={`${styles.num} ${side}`}>{pretty(p.szi, 6)}</div>
              <div className={`${styles.num} ${styles.hideSm}`}>{pretty(p.entryPx, 4)}</div>
              <div className={styles.num}>{mark ? pretty(mark, 4) : '—'}</div>
              <div className={styles.num}>{p.liquidationPx ? pretty(p.liquidationPx, 4) : '—'}</div>
              <div className={styles.num}>{p.leverage}×</div>
              <div className={styles.num}>{mark ? pretty(Math.abs(p.szi) * mark, 2) : '—'}</div>
              <div className={`${styles.num} ${p.unrealizedPnl >= 0 ? styles.green : styles.red}`}>{signed(p.unrealizedPnl, 2)}</div>
              <div className={styles.actCell}>
                <button className={styles.smallPill} onClick={() => close(p.coin, p.szi)} disabled={closing === p.coin} title="Close position">
                  {closing === p.coin ? 'Closing…' : 'Close'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error ? <div className={styles.empty}>{error}</div> : null}
    </div>
  );
}
