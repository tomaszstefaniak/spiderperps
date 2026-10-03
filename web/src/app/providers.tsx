'use client';

import React from 'react';
import { WatchlistProvider } from './context/WatchlistContext';
import { CopyTradeConfigProvider } from './context/CopyTradeConfigContext';
import { NETWORK } from '@/lib/hl-browser';
import { WalletProvider, useWallet } from './context/WalletContext';

function Helper({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();

  return (
    <CopyTradeConfigProvider>
      <WatchlistProvider walletAddress={address || undefined} network={NETWORK}>
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
