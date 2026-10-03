export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function usd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (opts.compact && Math.abs(n) >= 10_000) {
    // Hermes ignores Intl's `notation: 'compact'`, so abbreviate by hand.
    const [div, unit] = Math.abs(n) >= 1e9 ? [1e9, 'B'] : Math.abs(n) >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
    const v = n / div;
    return `$${v.toFixed(Math.abs(v) < 10 ? 1 : 0).replace(/\.0$/, '')}${unit}`;
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}`;
}

export function pct(n: number | null | undefined, signed = false): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = `${(n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0)}%`;
  return signed && n > 0 ? `+${s}` : s;
}

export function num(n: number, maxDecimals = 6): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

export function price(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 1 : n >= 1 ? 3 : 6;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function ago(unixSeconds: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.round(now - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function hold(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

const VERBS = { open: 'opened', increase: 'added to', decrease: 'reduced', close: 'closed', flip: 'flipped' } as const;

/** "opened ETH LONG", "reduced BTC SHORT", "flipped SOL to SHORT" */
export function moveText(p: { event: keyof typeof VERBS; coin: string; leader_from: number; leader_to: number }): string {
  if (p.event === 'flip') return `flipped ${p.coin} to ${p.leader_to > 0 ? 'LONG' : 'SHORT'}`;
  const side = (p.event === 'open' || p.event === 'increase' ? p.leader_to : p.leader_from) > 0 ? 'LONG' : 'SHORT';
  return `${VERBS[p.event]} ${p.coin} ${side}`;
}
