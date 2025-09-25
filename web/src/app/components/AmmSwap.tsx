// src/app/AmmSwap.tsx
import React from 'react';
import { PublicKey } from '@solana/web3.js';
import SwapPanel from './SwapPanel/SwapPanel';

type WalletType = {
  publicKey: PublicKey;
  signTransaction: (tx: any) => Promise<any>;
};

type Props = {
  wallet: WalletType | null;
  onConnectWallet: () => void;
};

export default function AmmSwap({ wallet, onConnectWallet }: Props) {
  return (
    <SwapPanel wallet={wallet} onConnectWallet={onConnectWallet} />
  );
}
