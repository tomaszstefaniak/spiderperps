'use client';
import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type CopyTradeConfig = {
  copyMultiplier: number;     // ratio / multiplier
  maxLeverage: number;
  perTradeCap: number;        // USDC
  slippageTolerance: number;  // 0.0 - 1.0 (e.g., 0.01 = 1%)
  pxDeviationGuard: number;   // in %
  dailyLossLimit: number;     // USDC
  circuitBreaker: boolean;    // stops auto-copy when tripped
  readOnly: boolean;          // paper trade / dry-run mode
};

const DEFAULTS: CopyTradeConfig = {
  copyMultiplier: 1,
  maxLeverage: 10,
  perTradeCap: 2_500,
  slippageTolerance: 0.01,
  pxDeviationGuard: 0.5,
  dailyLossLimit: 1_000,
  circuitBreaker: true,
  readOnly: true,
};

type Ctx = {
  config: CopyTradeConfig;
  setConfig(patch: Partial<CopyTradeConfig>): void;
  reset(): void;
};

const Ctx = createContext<Ctx | null>(null);

export function CopyTradeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigRaw] = useLocalStorage<CopyTradeConfig>('hl.copycfg.v1', DEFAULTS);
  const setConfig = useCallback((patch: Partial<CopyTradeConfig>) => {
    setConfigRaw(prev => ({ ...prev, ...patch }));
  }, [setConfigRaw]);
  const reset = useCallback(() => setConfigRaw(DEFAULTS), [setConfigRaw]);

  const value = useMemo<Ctx>(() => ({ config, setConfig, reset }), [config, setConfig, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCopyConfig() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCopyConfig must be used inside <CopyTradeConfigProvider>');
  return ctx;
}
