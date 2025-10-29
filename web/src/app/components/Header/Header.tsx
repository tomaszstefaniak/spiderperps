'use client';

import React, { useState, useMemo } from 'react';
import styles from './Header.module.css';
import { BACKGROUND_IMAGE, DEFAULT_BACKGROUND } from '@utils/config';
import { useWatchlist } from '@/app/context/WatchlistContext';

const mydexLogo = '/assets/logo/eth_logo_mini_white.svg';
const gearIcon = '/assets/images/gear-8.svg';

type Health = {
  ok?: boolean;
  network?: 'mainnet' | 'testnet' | string;
  trading_enabled?: boolean;
};

interface HeaderProps {
  onFollow?: (address: string) => void;
}

export default function Header({ onFollow }: HeaderProps) {
  const [showGearPopup, setShowGearPopup] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');  // search input state

  // Apply background image on mount
  React.useEffect(() => {
    const bg = DEFAULT_BACKGROUND || BACKGROUND_IMAGE?.[0] || '';
    if (bg && typeof document !== 'undefined') {
      document.body.style.backgroundImage = `url(${bg})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
    }
  }, []);

  // Health ping (check connection status)
  React.useEffect(() => {
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

  // Determine if current search term is a valid address (simple 0x... pattern)
  const isValidAddress = useMemo(() => /^0x[0-9A-Fa-f]{40}$/.test(searchTerm.trim()), [searchTerm]);
  const { watch, isWatched } = useWatchlist();

  const handleFollow = () => {
    if (!isValidAddress) return;
    if (!isWatched(searchTerm.trim())) {
      watch(searchTerm.trim());
    }
    setSearchTerm('');
  };

  return (
    <div className={styles.headerContainer}>
      {/* LEFT: Logo and section button */}
      <div className={styles.headerLeft}>
        <img src={mydexLogo} alt="logo" className={styles.headerLogo} />
        <span className={styles.headerAppName}>mydex</span>
        <button className={styles.headerButton}>Perps</button>
      </div>

      {/* CENTER: Search bar for addresses */}
      <div className={styles.headerCenter}>
        <div className={styles.headerSearchContainer}>
          <img
            src="/assets/loupe.svg"
            className={styles.headerSearchIcon}
            alt="Search"
          />
          <input
            className={styles.headerSearchInput}
            placeholder="Search address to follow"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search address input"
          />
          {isValidAddress && (
            <button 
              className={styles.followButton} 
              onClick={handleFollow}
            >
              Follow
            </button>
          )}
        </div>
      </div>

      {/* RIGHT: Settings gear and status display */}
      <div className={styles.headerRight}>
        {/* Settings gear icon */}
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

        {/* Connection status pill on far right */}
        <div style={{ color: health?.ok ? '#72f2b6' : '#fca5a5' }}>
          {status}{net ? ` · ${net}` : ''}
        </div>
      </div>
    </div>
  );
}
