// src/utils/walletUtils.ts
import { PublicKey, Transaction } from '@solana/web3.js'

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean
      publicKey?: { toString(): string }
      connect(): Promise<void>
      signTransaction(tx: Transaction): Promise<Transaction>
    }
    solflare?: {
      isSolflare?: boolean
      publicKey?: { toString(): string }
      connect(): Promise<void>
      signTransaction(tx: Transaction): Promise<Transaction>
    }
    backpack?: {
      isBackpack?: boolean
      publicKey?: { toString(): string }
      connect(): Promise<void>
      signTransaction(tx: Transaction): Promise<Transaction>
    }
  }
}

export interface Wallet {
  publicKey: PublicKey
  signTransaction(tx: Transaction): Promise<Transaction>
}

/** Generic wallet‐connector signature */
type Connector = () => Promise<Wallet>

export enum WalletName {
  Phantom = 'phantom',
  Solflare = 'solflare',
  Backpack = 'backpack',
}

/** Phantom */
export const connectPhantom: Connector = async () => {
  const p = window.solana
  if (!p?.isPhantom) {
    throw new Error('Phantom not found')
  }
  await p.connect()
  if (!p.publicKey) {
    throw new Error('Phantom: no publicKey after connect')
  }
  return {
    publicKey: new PublicKey(p.publicKey.toString()),
    signTransaction: (tx) => p.signTransaction(tx),
  }
}

/** Solflare */
export const connectSolflare: Connector = async () => {
  const s = window.solflare
  if (!s?.isSolflare) {
    throw new Error('Solflare not found')
  }
  await s.connect()
  if (!s.publicKey) {
    throw new Error('Solflare: no publicKey after connect')
  }
  return {
    publicKey: new PublicKey(s.publicKey.toString()),
    signTransaction: (tx) => s.signTransaction(tx),
  }
}

/** Backpack */
export const connectBackpack: Connector = async () => {
  const b = window.backpack
  if (!b?.isBackpack) {
    throw new Error('Backpack not found')
  }
  await b.connect()
  if (!b.publicKey) {
    throw new Error('Backpack: no publicKey after connect')
  }
  return {
    publicKey: new PublicKey(b.publicKey.toString()),
    signTransaction: (tx) => b.signTransaction(tx),
  }
}

export const connectors: Record<WalletName, Connector> = {
  [WalletName.Phantom]: connectPhantom,
  [WalletName.Solflare]: connectSolflare,
  [WalletName.Backpack]: connectBackpack,
}

/**
 * High‐level helper you can call from UI:
 *
 *    await connectWallet(WalletName.Phantom)
 */
export const connectWallet = async (name: WalletName): Promise<Wallet> => {
  const connector = connectors[name]
  if (!connector) {
    throw new Error(`[WalletUtils] Unknown wallet: ${name}`)
  }
  return connector()
}
