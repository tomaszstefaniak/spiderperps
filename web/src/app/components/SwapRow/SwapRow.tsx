'use client';
import React from 'react'
import AmountInput from '../AmountInput/AmountInput'
import styles from './SwapRow.module.css'

interface Props {
  label: 'Sell' | 'Buy'
  amount: string
  tokenSymbol: string
  tokenIcon?: string
  balance?: string
  disabled?: boolean
  onAmountChange?: (v: string) => void
  onOpenSelector: () => void
  showBalance?: boolean
}

const SwapRow: React.FC<Props> = ({
  label,
  amount,
  tokenSymbol,
  tokenIcon,
  balance,
  disabled = false,
  onAmountChange,
  onOpenSelector,
  showBalance,
}) => {
  const available = balance ? parseFloat(balance) : 0
  const handleHalf = () => onAmountChange?.((available * 0.5).toString())
  const handleMax  = () => onAmountChange?.(available.toString())

  return (
    <div className={styles.swapRow}>
      {/* HEADER */}
      <div className={styles.swapRowHeader}>
        <span className={styles.swapRowLabel}>{label}</span>

        {balance && onAmountChange && (
          <div className={styles.balanceAndButtonsInline}>
            <button
              type="button"
              className={styles.quickBtn}
              onClick={handleHalf}
            >
              50%
            </button>
            <button
              type="button"
              className={styles.quickBtn}
              onClick={handleMax}
            >
              max
            </button>
          </div>
        )}

        {showBalance && balance && (
          <span className={styles.tokenBalanceHeader}>{balance}</span>
        )}
      </div>

      {/* INPUT */}
      <div className={styles.swapRowInputs}>
        {onAmountChange ? (
          <AmountInput
            initial={amount}
            onDebouncedChange={onAmountChange}
            disabled={disabled}
          />
        ) : (
          <div className={styles.swapAmountOutput}>{amount}</div>
        )}
        <button
          className={styles.swapTokenSelector}
          onClick={onOpenSelector}
          disabled={disabled}
        >
          {tokenIcon && (
            <img
              src={tokenIcon}
              alt={tokenSymbol}
              className={styles.swapTokenIcon}
            />
          )}
          {tokenSymbol}
        </button>
      </div>
    </div>
  )
}

export default React.memo(SwapRow)
