// src/hooks/useBalances.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Position = {
  coin: string;
  szi: string | number;
  entryPx?: string | number;
  positionValue?: string | number;
  unrealizedPnl?: string | number;
  markPx?: string | number;
  indexPx?: string | number;
};

type BalancesResp =
  | {
      source: 'user_state' | 'spot' | string;
      withdrawable?: string;
      crossMarginSummary?: { accountValue?: string; totalMarginUsed?: string };
      marginSummary?: { accountValue?: string; totalMarginUsed?: string };
      assetPositions?: Array<{ type?: string; position?: any }>;
    }
  | Record<string, any>;

export function useBalances() {
  const [raw, setRaw] = useState<BalancesResp | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/balances', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || j?.detail || `HTTP ${r.status}`);
      setRaw(j);
    } catch (e: any) {
      setErr(e?.message || 'balances error');
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const withdrawable = useMemo(() => Number((raw as any)?.withdrawable || 0), [raw]);

  const accountValue = useMemo(() => {
    const s = (raw as any)?.crossMarginSummary || (raw as any)?.marginSummary;
    return Number(s?.accountValue || 0);
  }, [raw]);

  const totalMarginUsed = useMemo(() => {
    const s = (raw as any)?.crossMarginSummary || (raw as any)?.marginSummary;
    return Number(s?.totalMarginUsed || 0);
  }, [raw]);

  const positions: Position[] = useMemo(() => {
    const aps = Array.isArray((raw as any)?.assetPositions) ? (raw as any).assetPositions : [];
    return aps
      .map((x: any) => x?.position)
      .filter(Boolean)
      .map((p: any) => ({
        coin: String(p?.coin || '').toUpperCase(),
        szi: p?.szi ?? 0,
        entryPx: p?.entryPx,
        positionValue: p?.positionValue,
        unrealizedPnl: p?.unrealizedPnl,
        markPx: p?.markPx,       // if provided by API
        indexPx: p?.indexPx,     // fallback
      }));
  }, [raw]);

  // legacy balances map for anything else still using it (safe to keep)
  const balances = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    // spot balances (if available)
    const spot = (raw as any)?.balances;
    if (Array.isArray(spot)) {
      for (const b of spot) {
        const sym = String(b?.coin || b?.ticker || '').toUpperCase();
        if (!sym) continue;
        const amt = Number(b?.available || b?.total || b?.balance || 0);
        m[sym] = (m[sym] || 0) + (isFinite(amt) ? amt : 0);
      }
    }
    return m;
  }, [raw]);

  return {
    isLoading,
    error,
    refresh,
    raw,
    // perps essentials
    withdrawable,
    accountValue,
    totalMarginUsed,
    positions,
    // legacy
    balances,
  };
}
