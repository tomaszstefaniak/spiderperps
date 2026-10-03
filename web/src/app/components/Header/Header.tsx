'use client';

import React, { useState, useMemo } from 'react';
import styles from './Header.module.css';
import { BACKGROUND_IMAGE, DEFAULT_BACKGROUND } from '@utils/config';
import { useWatchlist } from '@/app/context/WatchlistContext';
import { useWallet } from '@/app/context/WalletContext';
import WalletModal from '../WalletModal/WalletModal';

const mydexLogo = '/assets/logo/eth_logo_mini_white.svg';
const gearIcon = '/assets/images/gear-8.svg';

type Health = {
  ok?: boolean;
  network?: 'mainnet' | 'testnet' | string;
  trading_enabled?: boolean;
};

export default function Header() {
  const [showGearPopup, setShowGearPopup] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const { watch, isWatched } = useWatchlist();
  const { address, connect, disconnect } = useWallet();

  // Background
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

  // Health ping
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

  const status = healthErr ? 'Disconnected' : health?.ok ? 'Connected' : 'Unknown';
  const net = health?.network ? (health.network === 'testnet' ? 'testnet' : 'mainnet') : '';

  // Input parsing
  const term = searchTerm.trim();
  const isEthAddress = useMemo(() => /^0x[0-9A-Fa-f]{40}$/.test(term), [term]);

  const handleFollow = () => {
    if (!isEthAddress) return;
    if (!isWatched(term)) watch(term);
    setSearchTerm('');
  };

  const shorten = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div className={styles.headerContainer}>
      <WalletModal
        visible={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={connect}
      />

      {/* LEFT: Logo */}
      <div className={styles.headerLeft}>
        <img src={mydexLogo} alt="logo" className={styles.headerLogo} />
        <span className={styles.headerAppName}>mydex</span>
      </div>

      {/* CENTER: Search */}
      <div className={styles.headerCenter}>
        <div className={styles.headerSearchContainer}>
          <img src="/assets/loupe.svg" className={styles.headerSearchIcon} alt="Search" />
          <input
            className={styles.headerSearchInput}
            placeholder="Search address to follow"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFollow();
            }}
          />
          {isEthAddress && (
            <button className={styles.followButton} onClick={handleFollow}>Follow</button>
          )}
        </div>
      </div>

      {/* RIGHT: Connect + Gear + status */}
      <div className={styles.headerRight}>

        {/* Connect Button */}
        {address ? (
          <button
            className={styles.headerButton}
            onClick={disconnect}
            title="Click to disconnect"
            style={{ fontSize: '0.9rem', marginRight: '0.5rem' }}
          >
            {shorten(address)}
          </button>
        ) : (
          <button
            className={styles.headerButton}
            onClick={() => setShowWalletModal(true)}
            style={{ fontSize: '0.9rem', marginRight: '0.5rem' }}
          >
            Connect Wallet
          </button>
        )}

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
              <button className={styles.cancelBtn} onClick={() => setShowGearPopup(false)}>
                Close
              </button>
            </div>
          </div>
        )}

        <div style={{ color: health?.ok ? '#72f2b6' : '#fca5a5' }}>
          {status}{net ? ` · ${net}` : ''}
        </div>
      </div>
    </div>
  );
}
