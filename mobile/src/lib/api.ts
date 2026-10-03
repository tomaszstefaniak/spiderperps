import { API_URL, type Network } from './config';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, opts: { token?: string | null; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.detail ?? `HTTP ${res.status}`);
  return json as T;
}

// ---- types mirroring hl-service/copytrade/api.py ----

export type Settings = {
  multiplier: number;
  max_usd: number;
  max_leverage: number;
  sl_pct: number | null;
  tp_pct: number | null;
  notify_info: boolean;
};

export type Proposal = {
  id: number;
  leader: string;
  coin: string;
  event: 'open' | 'increase' | 'decrease' | 'close' | 'flip';
  is_buy: boolean;
  size: number;
  reduce_only: boolean;
  leverage: number | null;
  ref_px: number | null;
  notional: number | null;
  leader_from: number;
  leader_to: number;
  leader_px: number | null;
  sl_pct: number | null;
  tp_pct: number | null;
  note: string | null;
  status: 'pending' | 'info' | 'approved' | 'rejected' | 'expired' | 'superseded' | 'failed';
  result: Record<string, unknown> | null;
  created_at: number;
  expires_at: number;
};

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

export type Follow = { leader: string; label: string | null; created_at: number; score: number | null; copied: Record<string, number> };

// ---- endpoints ----

export const api = {
  challenge: (address: string, network: Network) =>
    request<{ nonce: string; message: string }>('POST', '/v1/auth/challenge', { body: { address, network } }),
  verify: (nonce: string, signature: string) =>
    request<{ token: string; address: string; network: Network; role: 'wallet' | 'agent' }>('POST', '/v1/auth/verify', {
      body: { nonce, signature },
    }),
  logout: (token: string) => request<{ ok: boolean }>('POST', '/v1/auth/logout', { token }),
  linkedAccount: (agent: string, network: Network) =>
    request<{ address: string }>('GET', `/v1/links/${agent}?network=${network}`),

  me: (token: string) =>
    request<{ address: string; network: Network; role: string; settings: Settings; devices: number }>('GET', '/v1/me', { token }),
  updateSettings: (token: string, patch: Partial<Settings>) =>
    request<Settings>('PUT', '/v1/me/settings', { token, body: patch }),
  registerDevice: (token: string, push_token: string, platform: 'ios' | 'android') =>
    request<{ ok: boolean }>('POST', '/v1/devices', { token, body: { push_token, platform } }),

  follows: (token: string) => request<{ follows: Follow[] }>('GET', '/v1/follows', { token }),
  follow: (token: string, leader: string, label?: string) =>
    request<{ ok: boolean }>('POST', '/v1/follows', { token, body: { leader, label } }),
  unfollow: (token: string, leader: string) => request<{ ok: boolean }>('DELETE', `/v1/follows/${leader}`, { token }),

  proposals: (token: string, status: 'pending' | 'all' = 'all') =>
    request<{ proposals: Proposal[]; server_time: number }>('GET', `/v1/proposals?status=${status}`, { token }),
  proposal: (token: string, id: number) => request<Proposal & { server_time: number }>('GET', `/v1/proposals/${id}`, { token }),
  decide: (
    token: string,
    id: number,
    decision: 'approved' | 'rejected' | 'failed',
    extra: { filled_size?: number; result?: Record<string, unknown> } = {},
  ) => request<{ ok: boolean; status: string }>('POST', `/v1/proposals/${id}/decision`, { token, body: { decision, ...extra } }),

  discover: (limit = 50) =>
    request<{ status: { accounts?: number; screened?: number; scored?: number; refreshed_at?: number }; leaders: RankedLeader[] }>(
      'GET',
      `/v1/discover?limit=${limit}`,
    ),
  leader: (address: string) => request<LeaderDetail>('GET', `/v1/leaders/${address}`),
};
