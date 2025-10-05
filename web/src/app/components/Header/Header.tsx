'use client';

import React, { useEffect, useState } from 'react';
import styles from './Header.module.css';
import { BACKGROUND_IMAGE, DEFAULT_BACKGROUND } from '@utils/config';

const mydexLogo = '/assets/logo/eth_logo_mini_white.svg';
const gearIcon = '/assets/images/gear-8.svg';

type Health = {
  ok?: boolean;
  network?: 'mainnet' | 'testnet' | string;
  trading_enabled?: boolean;
};

export default function Header() {
  const [showGearPopup, setShowGearPopup] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string>('');

  // Apply the single background on mount
  useEffect(() => {
    const bg = DEFAULT_BACKGROUND || BACKGROUND_IMAGE?.[0] || '';
    if (bg && typeof document !== 'undefined') {
      document.body.style.backgroundImage = `url(${bg})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
    }
  }, []);

  // Health ping
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'health error');
        if (alive) setHealth(j);
      } catch (e: any) {
        if (alive) setHealthErr(e?.message || 'health error');
      }
    })();
    return () => { alive = false; };
  }, []);

  const status =
    healthErr ? 'Disconnected' :
    health?.ok ? 'Connected' : 'Unknown';
  const net = health?.network ? (health.network === 'testnet' ? 'testnet' : 'mainnet') : '';

  return (
    <div className={styles.headerContainer}>
      {/* LEFT */}
      <div className={styles.headerLeft}>
        <img src={mydexLogo} alt="logo" className={styles.headerLogo} />
        <span className={styles.headerAppName}>mydex</span>
        <button className={styles.headerButton}>Perps</button>
      </div>

      {/* CENTER (search – UI only for now) */}
      <div className={styles.headerCenter}>
        <div className={styles.headerSearchContainer}>
          <img
            src="/assets/loupe.svg"
            className={styles.headerSearchIcon}
            alt="Search"
          />
          <input
            className={styles.headerSearchInput}
            placeholder="Search token or address"
            readOnly
            onClick={() => {}}
            aria-label="Open token search"
          />
        </div>
      </div>

      {/* RIGHT */}
      <div className={styles.headerRight}>
        {/* Settings */}
        <button
          className={styles.headerButton}
          onClick={() => setShowGearPopup(v => !v)}
          aria-expanded={showGearPopup}
          aria-controls="gear-popup"
        >
          <img src={gearIcon} alt="settings" className={styles.headerGearIcon} />
        </button>

        {showGearPopup && (
          <div id="gear-popup" className={styles.headerGearPopupVertical}>
            <div className={styles.gearSection}>
              <strong>Status</strong>
              <div className={styles.headerExplorerLabel}>
                {status}{net ? ` · ${net}` : ''}
              </div>
            </div>

            <div className={styles.gearSection}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowGearPopup(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Status pill on the far right */}
        <div style={{ color: health?.ok ? '#72f2b6' : '#fca5a5' }}>
          {status}{net ? ` · ${net}` : ''}
        </div>
      </div>
    </div>
  );
}
