'use client';

import React, { useEffect, useState } from 'react';
import styles from './Header.module.css';
import { BACKGROUND_IMAGES } from '@utils/config'; // you already have this

const mydexLogo = '/assets/logo/eth_logo_mini_white.svg';
const gearIcon = '/assets/images/gear-8.svg';

type Health = {
  ok?: boolean;
  network?: 'mainnet' | 'testnet' | string;
  trading_enabled?: boolean;
};

export default function Header() {
  const [showGearPopup, setShowGearPopup] = useState(false);
  const [bg, setBg] = useState<string>(() => {
    if (typeof window === 'undefined') return BACKGROUND_IMAGES?.[0] || '';
    return window.localStorage.getItem('backgroundImage') || (BACKGROUND_IMAGES?.[0] || '');
  });

  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string>('');

  // Persist background locally so your Layout can read it if you want later
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('backgroundImage', bg || '');
      // Optional: apply directly to body for now
      if (bg) document.body.style.backgroundImage = `url(${bg})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    }
  }, [bg]);

  // Ping /api/health (fixes the 404 you saw previously)
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
        <button className={styles.headerButton}>Spot</button>
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
            onClick={() => {/* hook up your global token modal later if desired */}}
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
              <strong>Background</strong>
              <div className={styles.headerBackgroundGrid}>
                {BACKGROUND_IMAGES.map((img, i) => (
                  <div
                    key={i}
                    className={styles.headerBackgroundOption}
                    onClick={() => setBg(img)}
                  >
                    <img
                      src={img}
                      alt={`BG${i + 1}`}
                      className={styles.headerBackgroundOptionImage}
                    />
                  </div>
                ))}
              </div>
            </div>

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
        <div className={health?.ok ? undefined : styles.bad} style={{ color: health?.ok ? '#72f2b6' : '#fca5a5' }}>
          {status}{net ? ` · ${net}` : ''}
        </div>
      </div>
    </div>
  );
}
