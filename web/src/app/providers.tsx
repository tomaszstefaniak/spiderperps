'use client';

import React from 'react';
import { WatchlistProvider } from './context/WatchlistContext';
import { CopyTradeConfigProvider } from './context/CopyTradeConfigContext';
import { useNetwork } from '../hooks/useNetwork';

export default function Providers({ children }: { children: React.ReactNode }) {
  const network = useNetwork();                    // 'mainnet' | 'testnet' | 'unknown'
  // Replace this when wallet-connect is wired:
  const walletAddress: string | null | undefined = undefined;

  return (
    <CopyTradeConfigProvider>
      <WatchlistProvider walletAddress={walletAddress} network={network}>
        {children}
      </WatchlistProvider>
    </CopyTradeConfigProvider>
  );
}
