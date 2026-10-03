'use client';
import { useEffect, useRef, useState } from 'react';

export function formatUsdFlexible(n: number, minDp = 2, maxDp = 4) {
  // format to maxDp, then trim trailing zeros until minDp
  const s = n.toFixed(maxDp);
  const [int, frac = ''] = s.split('.');
  let f = frac;
  while (f.length > minDp && f.endsWith('0')) f = f.slice(0, -1);
  const composed = f.length ? `${int}.${f}` : `${int}.${'0'.repeat(minDp)}`;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDp }).format(Number(composed));
}

type Dir = 'flat' | 'up' | 'down';
export function useStickyPrice(value: number | null | undefined) {
  const [sticky, setSticky] = useState<number | null>(null);
  const [dir, setDir] = useState<Dir>('flat');
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    setSticky(value);
    if (prev.current !== null) {
      setDir(value > prev.current ? 'up' : value < prev.current ? 'down' : 'flat');
    }
    prev.current = value;
  }, [value]);

  return { sticky, dir };
}
