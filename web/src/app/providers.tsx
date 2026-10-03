'use client';

import React from 'react';
import { WatchlistProvider } from './context/WatchlistContext';
import { CopyTradeConfigProvider } from './context/CopyTradeConfigContext';
import { useNetwork } from '../hooks/useNetwork';
import { WalletProvider, useWallet } from './context/WalletContext';

function Helper({ children }: { children: React.ReactNode }) {
  const network = useNetwork();
  const { address } = useWallet();

  return (
    <CopyTradeConfigProvider>
      <WatchlistProvider walletAddress={address || undefined} network={network}>
        {children}
      </WatchlistProvider>
    </CopyTradeConfigProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <Helper>{children}</Helper>
    </WalletProvider>
  );
}
