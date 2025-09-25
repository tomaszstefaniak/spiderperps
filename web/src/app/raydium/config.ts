// src/raydium/config.ts
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

let raydiumInstance: Raydium | null = null;

export function makeWsUrl(httpUrl: string): string {
  return httpUrl
    .replace(/^https:/, 'wss:')
    .replace(/\/+$/, '')
    + '/ws';
}

export async function initRaydium(
  owner: Keypair | PublicKey,
  customRPC?: string
): Promise<Raydium> {
  if (raydiumInstance) return raydiumInstance;

  const rpcUrl =
    customRPC?.trim() ||
    'https://thrilling-tiniest-water.solana-mainnet.quiknode.pro/768da938e14b68c60112db16a8135f95a36e92f1/';

  const wsUrl = makeWsUrl(rpcUrl);

  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: wsUrl,
  });

  raydiumInstance = await Raydium.load({
    connection,
    owner,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
  });

  return raydiumInstance;
}
