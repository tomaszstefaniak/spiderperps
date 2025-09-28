import React, { useState } from 'react'
import styles from './WalletModal.module.css'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  connectSolflare,
  connectPhantom,
  connectBackpack,
} from '@utils/walletUtils'
import {
  normalizeError,
  createError,
  getUserFriendlyErrorMessage,
} from '@/utils/errorHandling'

export type WalletModalProps = {
  visible: boolean
  onClose: () => void
  onConnect: (info: {
    publicKey: PublicKey
    signTransaction: (tx: Transaction) => Promise<Transaction>
  }) => void
}

const WalletModal: React.FC<WalletModalProps> = ({
  visible,
  onClose,
  onConnect,
}) => {
  const [connectError, setConnectError] = useState<string | null>(null)

  if (!visible) return null

  const tryConnect = async (
    connector: () => Promise<{
      publicKey: PublicKey
      signTransaction: (tx: Transaction) => Promise<Transaction>
    }>
  ) => {
    setConnectError(null)
    try {
      const wallet = await connector()
      onConnect(wallet)
      onClose()
    } catch (err: any) {
    const appErr = normalizeError(err)
    createError(appErr.type, appErr.message, { originalError: err })
    setConnectError(getUserFriendlyErrorMessage(appErr))
    }
  }

  return (
    <div className={styles.walletModalOverlay}>
      <div className={styles.walletModalContent}>
        <h3>Select a Wallet</h3>

        {connectError && (
          <div className={styles.errorMessage}>⚠️ {connectError}</div>
        )}

        <button
          className={`${styles.walletButton} ${styles.walletOption}`}
          onClick={() => tryConnect(connectSolflare)}
        >
          <img
            src="/assets/solflare.svg"
            alt="Solflare"
            className={styles.walletIcon}
          />
          <span>Solflare</span>
        </button>

        <button
          className={`${styles.walletButton} ${styles.walletOption}`}
          onClick={() => tryConnect(connectPhantom)}
        >
          <img
            src="/assets/phantom.svg"
            alt="Phantom"
            className={styles.walletIcon}
          />
          <span>Phantom</span>
        </button>

        <button
          className={`${styles.walletButton} ${styles.walletOption}`}
          onClick={() => tryConnect(connectBackpack)}
        >
          <img
            src="/assets/backpack.png"
            alt="Backpack"
            className={styles.walletIcon}
          />
          <span>Backpack</span>
        </button>

        {/* “Other” fallback button */}
        <button
          className={`${styles.walletButton} ${styles.walletOption}`}
          onClick={onClose}
        >
          <img
            src="/assets/other.svg"
            alt="Other"
            className={styles.walletIcon}
          />
          <span>Other</span>
        </button>

        {/* Cancel at bottom */}
        <button
          className={`${styles.walletButton} ${styles.cancelButton}`}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default WalletModal
