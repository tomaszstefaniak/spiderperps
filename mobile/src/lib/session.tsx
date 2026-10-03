import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PrivateKeyAccount } from 'viem/accounts';

import { api, ApiError } from './api';
import type { Network } from './config';
import { forgetAgent, loadAgent } from './keys';

type SignedIn = { status: 'signedIn'; network: Network; address: `0x${string}`; token: string; agent: PrivateKeyAccount };
export type SessionState = { status: 'loading' } | { status: 'signedOut' } | SignedIn;

type SessionContext = {
  state: SessionState;
  /** Sign in to the copy-trading server by signing a one-time challenge with the agent key. */
  signIn: (network: Network, address: `0x${string}`, agent: PrivateKeyAccount) => Promise<void>;
  /** Run an authenticated call; transparently re-signs in once if the server session expired. */
  authed: <T>(call: (token: string) => Promise<T>) => Promise<T>;
  signOut: (opts?: { forgetKey?: boolean }) => Promise<void>;
};

const STORE_KEY = 'session';
const Ctx = createContext<SessionContext | null>(null);

async function challengeAndVerify(network: Network, address: string, agent: PrivateKeyAccount): Promise<string> {
  const { nonce, message } = await api.challenge(address, network);
  const signature = await agent.signMessage({ message });
  const { token } = await api.verify(nonce, signature);
  return token;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        if (!raw) return setState({ status: 'signedOut' });
        const saved = JSON.parse(raw) as { network: Network; address: `0x${string}`; token: string };
        const agent = await loadAgent(saved.network);
        setState(agent ? { status: 'signedIn', ...saved, agent } : { status: 'signedOut' });
      } catch {
        setState({ status: 'signedOut' });
      }
    })();
  }, []);

  const persist = useCallback(async (s: SignedIn) => {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ network: s.network, address: s.address, token: s.token }));
    setState(s);
  }, []);

  const signIn = useCallback<SessionContext['signIn']>(
    async (network, address, agent) => {
      const token = await challengeAndVerify(network, address, agent);
      await persist({ status: 'signedIn', network, address, token, agent });
    },
    [persist],
  );

  const authed = useCallback<SessionContext['authed']>(
    async (call) => {
      const s = stateRef.current;
      if (s.status !== 'signedIn') throw new Error('not signed in');
      try {
        return await call(s.token);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) throw e;
        const token = await challengeAndVerify(s.network, s.address, s.agent);
        await persist({ ...s, token });
        return call(token);
      }
    },
    [persist],
  );

  const signOut = useCallback<SessionContext['signOut']>(async (opts) => {
    const s = stateRef.current;
    if (s.status === 'signedIn') {
      api.logout(s.token).catch(() => {});
      if (opts?.forgetKey) await forgetAgent(s.network);
    }
    await SecureStore.deleteItemAsync(STORE_KEY);
    setState({ status: 'signedOut' });
  }, []);

  const value = useMemo(() => ({ state, signIn, authed, signOut }), [state, signIn, authed, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** The signed-in session, or null. */
export function useAccount(): SignedIn | null {
  const { state } = useSession();
  return state.status === 'signedIn' ? state : null;
}
