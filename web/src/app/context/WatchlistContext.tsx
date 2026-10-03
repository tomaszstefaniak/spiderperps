'use client';
import React, { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useLocalStorage } from '../context/useLocalStorage';

export type WatchedWallet = {
  address: string;
  autoCopy: boolean;
  notify: boolean;
  addedAt: number;
};

type Ctx = {
  list: WatchedWallet[];
  addresses: string[];
  count: number;
  isWatched(addr: string): boolean;
  watch(addr: string): void;
  unwatch(addr: string): void;
  toggleAutoCopy(addr: string): void;
  toggleNotify(addr: string): void;
  setAutoCopy(addr: string, v: boolean): void;
  setNotify(addr: string, v: boolean): void;
};

const WatchlistContext = createContext<Ctx | null>(null);
const ADDR_RE = /^0x[0-9A-Fa-f]{40}$/;

function scopedKey(network: string, walletAddress?: string | null) {
  const scope = (walletAddress?.toLowerCase() || 'local');
  const net = network || 'unknown';
  return `hl.${net}.watchlist.${scope}.v1`;
}

export function WatchlistProvider({
  children,
  walletAddress,
  network = 'unknown',
}: {
  children: React.ReactNode;
  walletAddress?: string | null;
  network?: string;
}) {
  const KEY = scopedKey(network, walletAddress);
  const [list, setList] = useLocalStorage<WatchedWallet[]>(KEY, []);

  // Migrate from:
  //  1) old global key (hl.watchlist.v1)
  //  2) 'unknown' scoped key -> resolved network key
  useEffect(() => {
    try {
      const hasNew = window.localStorage.getItem(KEY);
      if (!hasNew) {
        const unknownKey = scopedKey('unknown', walletAddress);
        const oldGlobal = 'hl.watchlist.v1';

        const fromUnknown = window.localStorage.getItem(unknownKey);
        const fromOld = window.localStorage.getItem(oldGlobal);

        if (fromUnknown) {
          window.localStorage.setItem(KEY, fromUnknown);
        } else if (fromOld) {
          window.localStorage.setItem(KEY, fromOld);
        }
      }
    } catch { }
    // run whenever scope changes
  }, [KEY, walletAddress]);

  // The web watchlist is local to this browser; following for copy alerts happens in the app.

  const addresses = useMemo(() => list.map(w => w.address), [list]);
  const count = list.length;

  const isWatched = useCallback((addr: string) => {
    const a = addr.trim();
    return list.some(w => w.address.toLowerCase() === a.toLowerCase());
  }, [list]);

  const watch = useCallback((addr: string) => {
    const a = addr.trim();
    if (!ADDR_RE.test(a)) return;

    setList(prev => {
      if (prev.some(w => w.address.toLowerCase() === a.toLowerCase())) return prev;
      return [...prev, { address: a, autoCopy: false, notify: false, addedAt: Date.now() }];
    });
  }, [setList]);

  const unwatch = useCallback((addr: string) => {
    const a = addr.trim().toLowerCase();

    setList(prev => prev.filter(w => w.address.toLowerCase() !== a));
  }, [setList]);

  const setAutoCopy = useCallback((addr: string, v: boolean) => {
    const a = addr.toLowerCase();
    setList(prev => prev.map(w => w.address.toLowerCase() === a ? { ...w, autoCopy: v } : w));
  }, [setList]);

  const setNotify = useCallback((addr: string, v: boolean) => {
    const a = addr.toLowerCase();
    setList(prev => prev.map(w => w.address.toLowerCase() === a ? { ...w, notify: v } : w));
  }, [setList]);

  const toggleAutoCopy = useCallback((addr: string) => {
    const a = addr.toLowerCase();
    setList(prev => prev.map(w => w.address.toLowerCase() === a ? { ...w, autoCopy: !w.autoCopy } : w));
  }, [setList]);

  const toggleNotify = useCallback((addr: string) => {
    const a = addr.toLowerCase();
    setList(prev => prev.map(w => w.address.toLowerCase() === a ? { ...w, notify: !w.notify } : w));
  }, [setList]);

  const value = useMemo<Ctx>(() => ({
    list, addresses, count,
    isWatched, watch, unwatch,
    toggleAutoCopy, toggleNotify,
    setAutoCopy, setNotify,
  }), [list, addresses, count, isWatched, watch, unwatch, toggleAutoCopy, toggleNotify, setAutoCopy, setNotify]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used inside <WatchlistProvider>');
  return ctx;
}
