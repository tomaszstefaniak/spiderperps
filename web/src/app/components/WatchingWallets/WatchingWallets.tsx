'use client';

import React from 'react';
import styles from './WatchingWallets.module.css';
import { useWatchlist } from '@/app/context/WatchlistContext';

const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WatchingWallets() {
  const { list, toggleAutoCopy, toggleNotify, remove } = useWatchlist();

  if (!list.length) {
    return <div className={styles.empty}>Not watching any wallets.</div>;
  }

  return (
    <div className={styles.rows}>
      {list.map((w) => {
        const label = w.short || shorten(w.address); // ← fallback so it never renders blank
        return (
          <div key={w.address} className={styles.row}>
            <a
              href={`https://app.hyperliquid.xyz/explorer/address/${w.address}`}
              target="_blank"
              rel="noreferrer"
              className={styles.addr}
              title={w.address}
            >
              {label}
            </a>

            <label
              className={`${styles.toggle} ${w.autoCopy ? styles.onGreen : ''}`}
              title="Auto Copy"
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
              onClick={() => remove(w.address)}
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
