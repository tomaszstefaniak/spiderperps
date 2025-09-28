'use client';

import React, { useMemo } from 'react';
import SelectTokenModal from './SelectTokenModal';
import { useTokens } from '@/hooks/useTokens';
import { useBalances } from '@/hooks/useBalances';

type Props = {
  visible: boolean;
  onClose(): void;
  onSelect(symbol: string): void;   // returns UPPERCASE symbol
  // kept for backward-compat with older calls; ignored here:
  poolMints?: Set<string>;
  rpcEndpoint?: string;
  owner?: any;
};

export default function SelectTokenModalSmart({
  visible,
  onClose,
  onSelect,
}: Props) {
  const { tokens, isLoading: tokensLoading } = useTokens();
  const { balances } = useBalances();

  // normalize tokens to the shape the modal expects
  const basicTokens = useMemo(
    () =>
      (tokens || []).map((t) => ({
        symbol: (t.symbol || '').toUpperCase(),
        name: t.symbol,        // you can map real names if you have them
        icon: undefined,       // fill if your API returns icons
      })),
    [tokens]
  );

  // symbol -> number (UI units)
  const balanceMap = useMemo(() => {
    const m: Record<string, number> = {};
    Object.entries(balances || {}).forEach(([sym, v]) => {
      m[sym.toUpperCase()] = Number(v || 0);
    });
    return m;
  }, [balances]);

  // Render nothing until we know enough to show (optional)
  if (!visible && tokensLoading) return null;

  return (
    <SelectTokenModal
      visible={visible}
      onClose={onClose}
      onSelect={(s) => onSelect(s.toUpperCase())}
      tokens={basicTokens}
      balances={balanceMap}
    />
  );
}
