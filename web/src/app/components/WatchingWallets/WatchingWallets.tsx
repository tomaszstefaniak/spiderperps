'use client';

import React from 'react';
import styles from './WatchingWallets.module.css';
import { useWatchlist } from '@/app/context/WatchlistContext';

const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface Props {
  onSelect?: (addr: string) => void;
}

export default function WatchingWallets({ onSelect }: Props) {
  const { list, toggleAutoCopy, toggleNotify, unwatch } = useWatchlist();

  if (!list.length) {
    return <div className={styles.empty}>Not watching any wallets.</div>;
  }

  return (
    <div className={styles.rows}>
      {list.map((w) => {
        const label = shorten(w.address);
        return (
          <div key={w.address} className={styles.row} onClick={() => onSelect?.(w.address)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <span className={styles.addr} title={w.address} style={{ marginRight: '8px' }}>
                {label}
              </span>
              <a
                href={`https://app.hyperliquid.xyz/explorer/address/${w.address}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: '10px', color: '#3b82f6', textDecoration: 'none' }}
                title="Explorer"
              >
                ↗
              </a>
            </div>

            <label
              className={`${styles.toggle} ${w.autoCopy ? styles.onGreen : ''}`}
              title="Auto Copy"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                className={styles.switch}
                checked={!!w.autoCopy}
                onChange={() => toggleAutoCopy(w.address)}
                aria-label="Enable auto copy"
              />
              Auto Copy
            </label>

            <label
              className={`${styles.toggle} ${w.notify ? styles.onGreen : ''}`}
              title="Notify"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                className={styles.switch}
                checked={!!w.notify}
                onChange={() => toggleNotify(w.address)}
                aria-label="Enable notifications"
              />
              Notify
            </label>

            <button
              className={styles.remove}
              onClick={(e) => { e.stopPropagation(); unwatch(w.address); }}
              aria-label={`Remove ${label} from watching`}
              title="Remove"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
