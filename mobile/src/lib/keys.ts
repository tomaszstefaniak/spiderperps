/**
 * The phone's Hyperliquid agent key. Generated on the device, stored in the iOS Keychain /
 * Android Keystore, never sent anywhere. Hyperliquid lets an agent place and cancel orders
 * for the account that approved it, but not withdraw or transfer funds.
 */
import { getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import type { Network } from './config';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // not synced to iCloud Keychain, not restored onto another device
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const keyName = (network: Network) => `agent-key.${network}`;

function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function loadAgent(network: Network): Promise<PrivateKeyAccount | null> {
  const key = await SecureStore.getItemAsync(keyName(network), OPTIONS);
  return key ? privateKeyToAccount(key as `0x${string}`) : null;
}

/** Returns the existing agent for this network, or creates one. */
export async function ensureAgent(network: Network): Promise<PrivateKeyAccount> {
  const existing = await loadAgent(network);
  if (existing) return existing;
  const key = toHex(await getRandomBytesAsync(32));
  await SecureStore.setItemAsync(keyName(network), key, OPTIONS);
  return privateKeyToAccount(key);
}

export async function forgetAgent(network: Network): Promise<void> {
  await SecureStore.deleteItemAsync(keyName(network), OPTIONS);
}

/** Named agents are capped at 16 characters by Hyperliquid; a per-install suffix keeps two phones apart. */
export function agentName(agentAddress: string): string {
  return `HL Copy ${agentAddress.slice(2, 6)}`;
}
