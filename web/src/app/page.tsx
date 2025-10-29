'use client';

import React from 'react';
import Header from './components/Header/Header';
import styles from './page.module.css';

import PerpOrderTicket from './components/PerpOrderTicket/PerpOrderTicket';
import TopFollowedWallets from './components/TopFollowedWallets/TopFollowedWallets';
import WatchingWallets from './components/WatchingWallets/WatchingWallets';
import PositionsTable from './components/Positions/PositionsTable';
import ExpandableCard from './components/ExpandableCard/ExpandableCard';

export default function Page() {
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
                title="Top Followed Wallets"
                right="Followers"
                storageKey="ui.exp.top"
                defaultOpen={false}
              >
                <TopFollowedWallets />
              </ExpandableCard>
            </div>

            {/* Center: Perp ticket */}
            <div className={styles.ticketWrap}>
              <PerpOrderTicket />
            </div>

            {/* Right: Watching (collapsed by default; sticky) */}
            <div className={styles.sidebarRight}>
              <ExpandableCard
                title="Watching"
                storageKey="ui.exp.watch"
                defaultOpen={false}
              >
                <WatchingWallets />
              </ExpandableCard>
            </div>
          </div>

          {/* Positions (collapsed by default; sticky) */}
          <div className={styles.positionsWrap}>
            <ExpandableCard
              title="Positions"
              storageKey="ui.exp.positions"
              defaultOpen={false}
            >
              <PositionsTable />
            </ExpandableCard>
          </div>
        </div>
      </div>
    </main>
  );
}
