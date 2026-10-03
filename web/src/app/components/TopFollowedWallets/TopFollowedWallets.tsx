'use client';

import React from 'react';
import useSWR from 'swr';

import { useWatchlist } from '@/app/context/WatchlistContext';

import styles from './TopFollowedWallets.module.css';

type Ranked = { address: string; score: number; metrics: { month_return: number; name?: string | null } };

const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

interface Props {
  onSelect?: (addr: string) => void;
}

/** Top traders by copyability score (from the copy-trading service). */
export default function TopFollowedWallets({ onSelect }: Props) {
  const { watch, isWatched } = useWatchlist();
  const { data, error } = useSWR<{ leaders: Ranked[] }>('/api/v1/discover?limit=10', fetcher, { refreshInterval: 60_000 });
  const leaders = data?.leaders ?? [];

  return (
    <div className={styles.listRows} data-title="Top traders">
      {error && <div style={{ padding: '1rem', color: '#888', fontSize: '0.9rem' }}>Rankings unavailable.</div>}
      {!error && leaders.length === 0 && <div style={{ padding: '1rem', color: '#888', fontSize: '0.9rem' }}>Scoring traders…</div>}
      {leaders.map((l) => {
        const watching = isWatched(l.address);
        const ret = l.metrics.month_return;
        return (
          <div key={l.address} className={styles.walletRow} onClick={() => onSelect?.(l.address)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div className={styles.link} title={l.address}>
                {l.metrics.name || shorten(l.address)}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                <span style={{ color: '#72f2b6' }}>score {Math.round(l.score)}</span>
                <span style={{ color: ret >= 0 ? '#72f2b6' : '#f87171' }}>
                  {ret >= 0 ? '+' : ''}
                  {(ret * 100).toFixed(0)}% 30d
                </span>
                <a href={`/trader/${l.address}`} onClick={(e) => e.stopPropagation()} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                  Profile ↗
                </a>
              </div>
            </div>

            <button
              className={styles.followBtn}
              disabled={watching}
              onClick={(e) => {
                e.stopPropagation();
                watch(l.address);
              }}
              style={{
                marginLeft: 'auto',
                padding: '4px 8px',
                fontSize: '11px',
                background: watching ? '#333' : '#2d2d2d',
                border: '1px solid #444',
                borderRadius: '4px',
                color: watching ? '#888' : '#fff',
                cursor: watching ? 'default' : 'pointer',
              }}>
              {watching ? 'Watching' : 'Watch'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
