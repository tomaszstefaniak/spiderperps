'use client';

import React, { createContext, useContext, useState } from 'react';

export type CopyMode = 'wallet' | 'algo';

type Ctx = { mode: CopyMode; setMode: (m: CopyMode) => void };
const CopyModeContext = createContext<Ctx>({ mode: 'wallet', setMode: () => {} });

export function CopyModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<CopyMode>('wallet');
  return <CopyModeContext.Provider value={{ mode, setMode }}>{children}</CopyModeContext.Provider>;
}

export function useCopyMode() {
  return useContext(CopyModeContext);
}
