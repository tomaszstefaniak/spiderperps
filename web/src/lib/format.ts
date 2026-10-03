export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function pct(n: number | null | undefined, signed = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = `${(n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0)}%`;
  return signed && n > 0 ? `+${s}` : s;
}

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `$${Math.round(n / 1e3)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 2 : 0 })}`;
}

export function hold(hours: number | null | undefined): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function ago(unixSeconds: number | undefined): string {
  if (!unixSeconds) return "";
  const s = Math.max(0, Math.round(Date.now() / 1000 - unixSeconds));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
