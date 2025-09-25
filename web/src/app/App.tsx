// src/app/App.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout/Layout";
import AmmSwap from "./components/AmmSwap";
import WalletModal from "./components/WalletModal/WalletModal";
import Header from "./components/Header/Header";
import { PublicKey, Transaction } from "@solana/web3.js";
import { SolanaProvider } from "@/app/context/SolanaContext";
import { TokenProvider } from "@/app/context/TokenContext";
import {
  ErrorBoundary,
  WalletErrorBoundary,
  TransactionErrorBoundary,
} from "./components/ErrorBoundary";
import { setupCSP } from "@utils/security";
import { DEFAULT_RPC, logger } from "@utils/config";

export type WalletType = {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export default function App() {
  // CSP only on client
  useEffect(() => {
    setupCSP();
  }, []);

  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const DEFAULT_BG = "/assets/images/background-10.webp";
  const [backgroundImage, setBackgroundImage] = useState(DEFAULT_BG);

  const [selectedRPC, setSelectedRPC] = useState(DEFAULT_RPC);

  useEffect(() => {
    const stored = window.localStorage.getItem("backgroundImage");
    if (stored) setBackgroundImage(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("backgroundImage", backgroundImage);
  }, [backgroundImage]);

  const handleOpenWalletModal = useCallback(
    () => setWalletModalOpen(true),
    []
  );
  const handleCloseWalletModal = useCallback(
    () => setWalletModalOpen(false),
    []
  );
  const handleWalletConnected = useCallback((w: WalletType) => {
    setWallet(w);
    setWalletModalOpen(false);
  }, []);
  const handleGlobalError = useCallback((error: Error) => {
    logger.error("Global application error:", error);
  }, []);

  return (
    <ErrorBoundary onError={handleGlobalError}>
      <SolanaProvider rpcUrl={selectedRPC}>
        <TokenProvider>
          <Layout backgroundImage={backgroundImage}>
            <WalletErrorBoundary>
              <Header
                wallet={wallet}
                setWallet={setWallet}
                onConnectWallet={handleOpenWalletModal}
                background={backgroundImage}
                onChangeBackground={setBackgroundImage}
                selectedRPC={selectedRPC}
                setSelectedRPC={setSelectedRPC}
              />
            </WalletErrorBoundary>
            <main className="app-main">
              <TransactionErrorBoundary>
                <AmmSwap
                  wallet={wallet}
                  onConnectWallet={handleOpenWalletModal}
                />
              </TransactionErrorBoundary>
            </main>
            <WalletModal
              visible={walletModalOpen}
              onClose={handleCloseWalletModal}
              onConnect={handleWalletConnected}
            />
          </Layout>
        </TokenProvider>
      </SolanaProvider>
    </ErrorBoundary>
  );
}
