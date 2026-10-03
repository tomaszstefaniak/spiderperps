'use client';

import React, {createContext, useContext, useEffect, useRef, useState} from 'react';

type Mids = Record<string, number>;
const Ctx = createContext<Mids>({});

export function LiveMidsProvider({children}: {children: React.ReactNode}) {
  const [mids, setMids] = useState<Mids>({});
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/mids', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok || typeof j !== 'object') return;
        // normalize keys to UPPER
        const m: Mids = {};
        Object.entries(j).forEach(([k, v]) => {
          if (typeof v === 'number' && Number.isFinite(v)) m[String(k).toUpperCase()] = v;
        });
        if (alive.current) setMids(m);
      } catch {/* ignore */}
    };
    pull();
    const t = setInterval(pull, 3000);
    return () => { alive.current = false; clearInterval(t); };
  }, []);

  return <Ctx.Provider value={mids}>{children}</Ctx.Provider>;
}

export function useLiveMids() { return useContext(Ctx); }
