'use client';
import { useEffect, useState } from 'react';

export function useStickyNumber(value: number | null | undefined) {
  const [sticky, setSticky] = useState<number | null>(null);
  useEffect(() => {
    if (value !== null && value !== undefined && !Number.isNaN(value)) {
      setSticky(value);
    }
  }, [value]);
  return sticky;
}

export function fmtUsd(n: number | null, dp = 2) {
  if (n === null) return '';
  try {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
      .format(n);
  } catch {
    return n.toFixed(dp);
  }
}
