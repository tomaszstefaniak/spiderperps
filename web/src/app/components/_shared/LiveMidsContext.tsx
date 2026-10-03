'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

import { loadMids } from '@/lib/hl-browser';

type Mids = Record<string, number>;
const Ctx = createContext<Mids>({});

/** Mid prices for every perp, straight from Hyperliquid, refreshed every 3s. */
export function LiveMidsProvider({ children }: { children: React.ReactNode }) {
  const [mids, setMids] = useState<Mids>({});

  useEffect(() => {
    let alive = true;
    const pull = () =>
      loadMids()
        .then((m) => alive && setMids(m))
        .catch(() => {});
    pull();
    const t = setInterval(pull, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return <Ctx.Provider value={mids}>{children}</Ctx.Provider>;
}

export function useLiveMids() {
  return useContext(Ctx);
}
