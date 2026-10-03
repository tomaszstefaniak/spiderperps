// viem / @noble use the Web Crypto `crypto.getRandomValues`, which React Native doesn't provide.
// expo-crypto's native CSPRNG fills the gap. Import this module before anything else.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = getRandomValues;
}
