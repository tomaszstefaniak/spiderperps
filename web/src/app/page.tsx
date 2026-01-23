'use client';

import React, { useState } from 'react';
import Header from './components/Header/Header';
import styles from './page.module.css';

import PerpOrderTicket from './components/PerpOrderTicket/PerpOrderTicket';
import TopFollowedWallets from './components/TopFollowedWallets/TopFollowedWallets';
import WatchingWallets from './components/WatchingWallets/WatchingWallets';
import PositionsTable from './components/Positions/PositionsTable';
import WalletPositions from './components/Positions/WalletPositions';
import ExpandableCard from './components/ExpandableCard/ExpandableCard';

import { useCopyMode } from '@/app/context/CopyModeContext';

export default function Page() {
  const { mode } = useCopyMode();
  const topTitle =
    mode === 'wallet' ? 'Top Followed Wallets' : 'Top Followed Algorithms';

  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [presetOrder, setPresetOrder] = useState<{ coin: string, side: 'long' | 'short', size?: number } | null>(null);

  const shorten = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <div className={styles.stack}>
          {/* Top row */}
          <div className={styles.topRow}>
            {/* Left: Top Followed (collapsed by default; sticky) */}
            <div className={styles.sidebarLeft}>
              <ExpandableCard
                title={topTitle}
                right="Followers"
                storageKey="ui.exp.top"
                defaultOpen={false}
              >
                <TopFollowedWallets onSelect={setSelectedWallet} />
              </ExpandableCard>
            </div>

            {/* Center: Perp ticket */}
            <div className={styles.ticketWrap}>
              <PerpOrderTicket preset={presetOrder} />
            </div>

            {/* Right: Watching (collapsed by default; sticky) */}
            <div className={styles.sidebarRight}>
              <ExpandableCard
                title="Watching"
                storageKey="ui.exp.watch"
                defaultOpen={false}
              >
                <WatchingWallets onSelect={setSelectedWallet} />
              </ExpandableCard>
            </div>
          </div>

          {/* Positions (collapsed by default; sticky) */}
          <div className={styles.positionsWrap}>
            <ExpandableCard
              title={selectedWallet ? `Positions: ${shorten(selectedWallet)}` : "Positions"}
              storageKey="ui.exp.positions"
              defaultOpen={false}
            >
              {selectedWallet ? (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setSelectedWallet(null)}
                    style={{
                      position: 'absolute',
                      top: '-2.5rem',
                      right: '0rem',
                      padding: '4px 8px',
                      background: '#333',
                      border: '1px solid #444',
                      color: '#fff',
                      borderRadius: '4px',
                      fontSize: '0.8.5rem',
                      cursor: 'pointer',
                      zIndex: 10
                    }}
                  >
                    Back to My Positions
                  </button>
                  <WalletPositions
                    address={selectedWallet}
                    onCopy={(pos) => setPresetOrder({ coin: pos.coin, side: pos.side, size: pos.size })}
                  />
                </div>
              ) : (
                <PositionsTable />
              )}
            </ExpandableCard>
          </div>
        </div>
      </div>
    </main>
  );
}
