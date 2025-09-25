// src/components/SwapInfoBox/SwapInfoBox.tsx
'use client';
import React, { useState } from 'react'
import styles from './SwapInfoBox.module.css'

export type SwapInfoBoxProps = {
  rateLabel: string
  feeLabel: string
  networkFeeLabel: string
  poolFeeLabel: string
  priceImpactLabel: string
  routeCount: number
  routerLabel: string
}

export default function SwapInfoBox({
  rateLabel,
  feeLabel,
  networkFeeLabel,
  poolFeeLabel,
  priceImpactLabel,
  routeCount,
  routerLabel,
}: SwapInfoBoxProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={styles.swapInfoBox}>
      <div
        className={styles.swapInfoHeader}
        onClick={() => setExpanded(x => !x)}
      >
        <span className={styles.swapInfoRate}>{rateLabel}</span>
        <span className={styles.swapInfoFeeBadge}>{feeLabel}</span>
        <span
          className={
            expanded
              ? `${styles.swapInfoArrow} ${styles.swapInfoArrowOpen}`
              : styles.swapInfoArrow
          }
        >
          ▼
        </span>
      </div>

      {expanded && (
        <div className={styles.swapInfoDetails}>
          <div className={styles.swapInfoRow}>
            <span>Network Fee</span>
            <span>{networkFeeLabel}</span>
          </div>
          <div className={styles.swapInfoRow}>
            <span>Pool Fee</span>
            <span>{poolFeeLabel}</span>
          </div>
          <div className={styles.swapInfoRow}>
            <span>Price Impact</span>
            <span>{priceImpactLabel}</span>
          </div>
          <div className={styles.swapInfoRow}>
            <span>Route</span>
            <span>
              {routeCount} {routeCount === 1 ? 'market' : 'markets'} via{' '}
              {routerLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
