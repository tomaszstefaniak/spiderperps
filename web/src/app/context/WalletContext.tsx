"use client";
import React, { createContext, useContext, useState } from "react";

type WalletState = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState>({
  address: null,
  connect: async () => {},
  disconnect: () => {},
});

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const connect = async () => setAddress("HL-PLACEHOLDER");
  const disconnect = () => setAddress(null);
  return (
    <WalletContext.Provider value={{ address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
