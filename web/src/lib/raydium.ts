// src/lib/raydium.ts
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { Connection, clusterApiUrl, Keypair } from '@solana/web3.js';

let raydium: Raydium | null = null;
export async function getRaydium() {
  if (raydium) return raydium;
  const RPC = process.env.DEFAULT_RPC ?? clusterApiUrl('mainnet-beta');
  const conn = new Connection(RPC, 'confirmed');
  raydium = await Raydium.load({
    connection: conn,
    owner: Keypair.generate(),     // dummy – no TX signing from server
    cluster: 'mainnet',
    disableFeatureCheck: true,
  });
  return raydium;
}