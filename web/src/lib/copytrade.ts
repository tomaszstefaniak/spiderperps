// Server-side reads from the copy-trading API (backend/copytrade/api.py).
const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";

export type LeaderMetrics = {
  equity: number;
  month_return: number;
  month_max_dd: number;
  all_time_return: number;
  positive_weeks: number | null;
  round_trips_14d: number;
  win_rate: number | null;
  median_hold_h: number | null;
  copyable_share: number | null;
  top_coins: string[];
  open_positions: number;
  leverage_now: number;
  reasons: string[];
  name?: string | null;
};

export type RankedLeader = { address: string; score: number; metrics: LeaderMetrics; updated_at: number };

export type LeaderDetail = RankedLeader & {
  positions: { coin: string; szi: number; entry_px: number; leverage: number | null }[];
  followers: number;
};

export type DiscoverStatus = { accounts?: number; screened?: number; scored?: number; refreshed_at?: number };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${svc}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`copy service ${r.status}`);
  return r.json() as Promise<T>;
}

export const getRanking = (limit = 25) => get<{ status: DiscoverStatus; leaders: RankedLeader[] }>(`/v1/discover?limit=${limit}`);

export const getLeader = (address: string) => get<LeaderDetail>(`/v1/leaders/${address}`);

export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
