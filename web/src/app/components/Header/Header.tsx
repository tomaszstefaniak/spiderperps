'use client';

import React, { useState, useMemo } from 'react';
import styles from './Header.module.css';
import { BACKGROUND_IMAGE, DEFAULT_BACKGROUND } from '@utils/config';
import { useWatchlist } from '@/app/context/WatchlistContext';
import { useCopyMode } from '@/app/context/CopyModeContext';
import { useWallet } from '@/app/context/WalletContext';
import WalletModal from '../WalletModal/WalletModal';

const mydexLogo = '/assets/logo/eth_logo_mini_white.svg';
const gearIcon = '/assets/images/gear-8.svg';

type Health = {
  ok?: boolean;
  network?: 'mainnet' | 'testnet' | string;
  trading_enabled?: boolean;
};

interface HeaderProps {
  onFollow?: (addressOrAlgo: string) => void;
}

export default function Header({ onFollow }: HeaderProps) {
  const [showGearPopup, setShowGearPopup] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const { mode, setMode } = useCopyMode();
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
  const isAlgoId = useMemo(() => /^[a-z0-9][a-z0-9-_]{2,}$/i.test(term), [term]); // simple slug rule

  // Wallet validation only for wallet mode (kept for clarity)
  const isValidWalletAddress = useMemo(
    () => mode === 'wallet' && isEthAddress,
    [mode, isEthAddress]
  );

  const handleFollow = () => {
    if (!term) return;

    if (mode === 'wallet') {
      if (!isEthAddress) return;                   // block non-addresses in wallet mode
      if (!isWatched(term)) watch(term);
      setSearchTerm('');
      return;
    }

    // mode === 'algo'
    if (!isAlgoId || isEthAddress) return;         // block addresses & junk in algo mode
    onFollow?.(term);                               // hook for your algo-follow logic
    setSearchTerm('');
  };

  const placeholder = mode === 'wallet'
    ? 'Search address to follow'
    : 'Search algo to follow';

  const shorten = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div className={styles.headerContainer}>
      <WalletModal
        visible={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={connect}
      />

      {/* LEFT: Logo + toggle */}
      <div className={styles.headerLeft}>
        <img src={mydexLogo} alt="logo" className={styles.headerLogo} />
        <span className={styles.headerAppName}>mydex</span>

        <div className={styles.toggleGroup} role="tablist" aria-label="Copy mode">
          <button
            className={`${styles.headerButton} ${mode === 'wallet' ? styles.headerButtonActive : ''}`}
            onClick={() => setMode('wallet')}
            aria-pressed={mode === 'wallet'}
          >
            wallet copy
          </button>
          <button
            className={`${styles.headerButton} ${mode === 'algo' ? styles.headerButtonActive : ''}`}
            onClick={() => setMode('algo')}
            aria-pressed={mode === 'algo'}
          >
            algo copy
          </button>
        </div>
      </div>

      {/* CENTER: Search */}
      <div className={styles.headerCenter}>
        <div className={styles.headerSearchContainer}>
          <img src="/assets/loupe.svg" className={styles.headerSearchIcon} alt="Search" />
          <input
            className={styles.headerSearchInput}
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFollow();
            }}
          />
          {/* wallet mode: show button only for valid address */}
          {mode === 'wallet' && isValidWalletAddress && (
            <button className={styles.followButton} onClick={handleFollow}>Follow</button>
          )}
          {/* algo mode: show button only for algo-like id, not for addresses */}
          {mode === 'algo' && isAlgoId && !isEthAddress && (
            <button className={styles.followButton} onClick={handleFollow}>Follow</button>
          )}
        </div>

        {/* optional UX nudge if user types an address while in algo mode */}
        {mode === 'algo' && isEthAddress && (
          <div style={{ position: 'absolute', marginTop: 42, fontSize: 12, opacity: 0.8 }}>
            Enter an algorithm id (not a wallet address)
          </div>
        )}
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
