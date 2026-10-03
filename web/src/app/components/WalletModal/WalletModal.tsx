import React, { useState } from 'react';
import styles from './WalletModal.module.css';

export type WalletModalProps = {
  visible: boolean;
  onClose: () => void;
  onConnect: (address: string, providerType: 'metamask' | 'phantom' | 'other') => void;
};

const WalletModal: React.FC<WalletModalProps> = ({
  visible,
  onClose,
  onConnect,
}) => {
  const [connectError, setConnectError] = useState<string | null>(null);

  if (!visible) return null;

  const connectEVM = async (type: 'metamask' | 'phantom') => {
    setConnectError(null);
    try {
      let provider: any = null;

      if (typeof window === 'undefined') {
        throw new Error('Window is undefined');
      }

      const ethereum = (window as any).ethereum;
      const phantom = (window as any).phantom?.ethereum;

      if (type === 'metamask') {
        if (ethereum?.isMetaMask && !ethereum?.isPhantom) {
          provider = ethereum;
        } else if (ethereum?.providers?.find((p: any) => p.isMetaMask)) {
          provider = ethereum.providers.find((p: any) => p.isMetaMask);
        } else {
          // Fallback if only one injected
          provider = ethereum;
        }

        if (!provider) throw new Error('MetaMask not found');
      } else if (type === 'phantom') {
        if (phantom) {
          provider = phantom;
        } else if (ethereum?.isPhantom) {
          provider = ethereum;
        } else {
          throw new Error('Phantom not found');
        }
      }

      if (!provider) throw new Error('Provider not found');

      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }
      onConnect(accounts[0], type);
      onClose();

    } catch (err: any) {
      console.error(err);
      setConnectError(err.message || 'Connection failed');
    }
  };

  return (
    <div className={styles.walletModalOverlay}>
      <div className={styles.walletModalContent}>
        <h3>Select a Wallet</h3>

        {connectError && (
          <div className={styles.errorMessage}>⚠️ {connectError}</div>
        )}

        <button
          className={`${styles.walletButton} ${styles.walletOption}`}
          onClick={() => connectEVM('metamask')}
        >
          {/* <img src="/assets/metamask.svg" alt="MetaMask" className={styles.walletIcon} /> */}
          <span style={{ fontWeight: 'bold' }}>🦊 MetaMask</span>
        </button>

        <button
          className={`${styles.walletButton} ${styles.walletOption}`}
          onClick={() => connectEVM('phantom')}
        >
          {/* <img src="/assets/phantom.svg" alt="Phantom" className={styles.walletIcon} /> */}
          <span style={{ fontWeight: 'bold' }}>👻 Phantom</span>
        </button>

        <button
          className={`${styles.walletButton} ${styles.cancelButton}`}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default WalletModal;
