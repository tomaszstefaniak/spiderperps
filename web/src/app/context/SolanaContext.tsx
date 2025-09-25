// src/context/SolanaContext.tsx
import React, { createContext, useContext, useMemo } from 'react';
import { Connection, Commitment } from '@solana/web3.js';
import { makeWsUrl } from '../raydium/config';

const SolanaContext = createContext<Connection | null>(null);

/**
 * Wrap the app in this provider and pass the `rpcUrl` string.
 * Internally it creates one Connection per URL, wired up with a WebSocket endpoint.
 */
export const SolanaProvider: React.FC<{
  rpcUrl: string;
  children: React.ReactNode;
}> = ({ rpcUrl, children }) => {
  const connection = useMemo(() => {
    const wsUrl = makeWsUrl(rpcUrl);
    return new Connection(rpcUrl, {
      commitment: 'confirmed' as Commitment,
      wsEndpoint: wsUrl,
    });
  }, [rpcUrl]);

  return (
    <SolanaContext.Provider value={connection}>
      {children}
    </SolanaContext.Provider>
  );
};

export function useConnection(): Connection {
  const conn = useContext(SolanaContext);
  if (!conn) throw new Error('useConnection must be inside SolanaProvider');
  return conn;
}
