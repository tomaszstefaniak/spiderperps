'use client';

import Header from './components/Header/Header';
import PerpOrderTicket from './components/PerpOrderTicket/PerpOrderTicket';
import PositionsTable from './components/Positions/PositionsTable';
import styles from './page.module.css';

export default function Page() {
  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <div className={styles.stack}>
          <div className={styles.ticketWrap}>
            <PerpOrderTicket />
          </div>

          <div className={styles.positionsWrap}>
            <PositionsTable />
          </div>
        </div>
      </div>
    </main>
  );
}
