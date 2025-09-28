import { PublicKey, Transaction } from '@solana/web3.js';

declare global {
  interface WalletType {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  }

  interface TokenInfo {
    symbol: string;
    name: string;
    mint: string;
    decimals: number;
    icon?: string;
    balance?: string;
  }

  interface PoolInfo {
    id: string;
    baseMint: string;
    quoteMint: string;
    liquidity: number;
    volume24h: number;
  }

  interface SwapConfig {
    feeRate: number;
    feeWallet: string;
    rpcUrl: string;
    swapHost: string;
  }

  interface AppError extends Error {
    type: string;
    code?: number;
    data?: any;
  }
}

export {};
