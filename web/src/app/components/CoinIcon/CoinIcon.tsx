'use client';

import React from 'react';

type Props = {
  symbol: string;
  size?: number;
  className?: string;
};

function clean(sym: string) {
  // "PURR/USDC" -> "PURR", strip odd chars
  return String(sym || '')
    .split('/')[0]
    .toUpperCase()
    .replace(/^@/, '')
    .replace(/[^A-Z0-9]/g, '');
}

export default function CoinIcon({ symbol, size = 16, className }: Props) {
  const sym = clean(symbol);
  const local = `/coins/${sym}.svg`;
  const remote = `https://app.hyperliquid.xyz/coins/${sym}.svg`;

  const [src, setSrc] = React.useState(local);

  return (
    <img
      src={src}
      alt={`${sym} icon`}
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      onError={() => {
        if (src !== remote) setSrc(remote);
        else setSrc('/coins/_default.svg');
      }}
    />
  );
}
