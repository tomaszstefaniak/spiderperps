'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import styles from './TopFollowedWallets.module.css';
import { useWatchlist } from '@/app/context/WatchlistContext';
import { useWallet } from '@/app/context/WalletContext';

const WALLET_EXPLORER = 'https://app.hyperliquid.xyz/explorer/address/';

const shorten = (a: string) => a.slice(0, 6) + '...' + a.slice(-4);
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Props {
  onSelect?: (addr: string) => void;
}

export default function TopFollowedWallets({ onSelect }: Props) {
  const { watch, isWatched } = useWatchlist();
  const { address } = useWallet();

  const { data: followedData } = useSWR('/api/followed/top', fetcher, { refreshInterval: 10000 });

  const topWallets = useMemo(() => {
    if (followedData && Array.isArray(followedData.top)) {
      return followedData.top;
    }
    return [];
  }, [followedData]);

  return (
    <div className={styles.listRows} data-title="Top followed wallets">
      {topWallets.length === 0 && <div style={{ padding: '1rem', color: '#888', fontSize: '0.9rem' }}>No followed wallets yet.</div>}
      {topWallets.map((item: any) => {
        const addr = item.address;
        const count = item.followers;
        const watching = isWatched(addr);

        return (
          <div key={addr} className={styles.walletRow} onClick={() => onSelect?.(addr)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div className={styles.link} title={addr}>
                {shorten(addr)}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#666' }}>
                  {count} followers
                </span>
                <a
                  href={WALLET_EXPLORER + addr}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: '10px', color: '#3b82f6', textDecoration: 'none' }}
                >
                  Explorer ↗
                </a>
              </div>
            </div>

            <button
              className={styles.followBtn}
              disabled={watching}
              onClick={(e) => {
                e.stopPropagation();
                if (address) {
                  watch(addr);
                } else {
                  alert("Please connect wallet first");
                }
              }}
              style={{
                marginLeft: 'auto',
                padding: '4px 8px',
                fontSize: '11px',
                background: watching ? '#333' : '#2d2d2d',
                border: '1px solid #444',
                borderRadius: '4px',
                color: watching ? '#888' : '#fff',
                cursor: watching ? 'default' : 'pointer'
              }}
            >
              {watching ? 'Following' : 'Follow'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
