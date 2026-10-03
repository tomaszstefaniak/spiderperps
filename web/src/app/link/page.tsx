import { Suspense } from 'react';

import LinkApproval from './LinkApproval';
import styles from './link.module.css';

export const metadata = { title: 'Approve your phone · HL Copy' };

export default function LinkPage() {
  return (
    <main className={styles.page}>
      {/* LinkApproval reads the query string, so it renders on the client. */}
      <Suspense fallback={<div className={styles.card}>Loading…</div>}>
        <LinkApproval />
      </Suspense>
    </main>
  );
}
