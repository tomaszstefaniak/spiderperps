'use client';
import React from 'react';
import styles from './PerpOrderTicket.module.css';
import { useStickyPrice, formatUsdFlexible } from '../_shared/price';

export default function MarkTicker({ value }: { value: number | null | undefined }) {
  const { sticky, dir } = useStickyPrice(value);
  const cls =
    dir === 'up' ? styles.markUp :
    dir === 'down' ? styles.markDown : styles.markNeutral;

  return (
    <div className={styles.markRow}>
      <span className={`${styles.markText} ${cls}`}>
        {sticky !== null ? `Mark: ${formatUsdFlexible(sticky)} USDC` : 'Mark:'}
      </span>
    </div>
  );
}
