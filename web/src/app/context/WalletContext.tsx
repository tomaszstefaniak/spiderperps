'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface WalletContextType {
  address: string | null;
  providerType: 'metamask' | 'phantom' | 'other' | null;
  connect: (address: string, type: 'metamask' | 'phantom' | 'other') => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  providerType: null,
  connect: () => { },
  disconnect: () => { },
});

export const useWallet = () => useContext(WalletContext);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<'metamask' | 'phantom' | 'other' | null>(null);

  // Restore connection if needed (simple version)
  // complicated to auto-reconnect without triggers, skipping for now to keep it simple as per plan.

  const connect = (addr: string, type: 'metamask' | 'phantom' | 'other') => {
    setAddress(addr);
    setProviderType(type);
  };

  const disconnect = () => {
    setAddress(null);
    setProviderType(null);
  };

  return (
    <WalletContext.Provider value={{ address, providerType, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
