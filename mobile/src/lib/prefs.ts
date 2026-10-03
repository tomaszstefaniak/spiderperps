// Device-local preferences (not synced to the server).
import * as SecureStore from 'expo-secure-store';

export type LocalPrefs = {
  /** Ask for Face ID / Touch ID / passcode before signing each order. */
  requireBiometrics: boolean;
  /** Max price slippage for the market order of an approved copy. */
  slippage: number;
};

const DEFAULTS: LocalPrefs = { requireBiometrics: true, slippage: 0.01 };
const KEY = 'local-prefs';

export async function loadPrefs(): Promise<LocalPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function savePrefs(patch: Partial<LocalPrefs>): Promise<LocalPrefs> {
  const next = { ...(await loadPrefs()), ...patch };
  await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  return next;
}
