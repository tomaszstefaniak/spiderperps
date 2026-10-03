'use client';
/**
 * Trading from the browser without a server key - the same model as Hyperliquid's own
 * "Enable trading": the browser creates an agent key, the user's wallet approves it once
 * (approveAgent), and the agent signs orders locally. Agent keys can place and cancel orders
 * but can't withdraw or transfer funds.
 */
import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { marketPrice, priceWire, roundSizeDown, sizeWire, triggerLimitPrice } from './order-math';

export type Network = 'mainnet' | 'testnet';
export const NETWORK: Network = process.env.NEXT_PUBLIC_HL_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

const AGENT_NAME = 'SpiderPerps web'; // one named agent per account for the web (max 16 chars)

// The SDK is loaded on demand: it never runs during server rendering.
const sdk = () => import('@nktkas/hyperliquid');

let transportPromise: Promise<import('@nktkas/hyperliquid').HttpTransport> | null = null;
function transport() {
  transportPromise ??= sdk().then(({ HttpTransport }) => new HttpTransport({ isTestnet: NETWORK === 'testnet' }));
  return transportPromise;
}

async function infoClient() {
  const { InfoClient } = await sdk();
  return new InfoClient({ transport: await transport() });
}

// ---------------------------------------------------------------- market data

export type Market = { name: string; asset: number; szDecimals: number; maxLeverage: number };

let marketsPromise: Promise<Market[]> | null = null;

/** Tradable (not delisted) perps, fetched once per page load. */
export function loadMarkets(): Promise<Market[]> {
  marketsPromise ??= fetchMarkets().catch((e) => {
    marketsPromise = null;
    throw e;
  });
  return marketsPromise;
}

async function fetchMarkets(): Promise<Market[]> {
  const meta = await (await infoClient()).meta();
  // `asset` is the index in the full universe (delisted markets keep their slot).
  return meta.universe.flatMap((u, asset) =>
    u.isDelisted ? [] : [{ name: u.name, asset, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage }],
  );
}

export async function loadMids(): Promise<Record<string, number>> {
  const raw = await (await infoClient()).allMids();
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
}

// ---------------------------------------------------------------- account

export type Position = { coin: string; szi: number; entryPx: number; unrealizedPnl: number; leverage: number; liquidationPx: number | null };
export type Account = { equity: number; withdrawable: number; positions: Position[] };

export async function loadAccount(user: `0x${string}`): Promise<Account> {
  const s = await (await infoClient()).clearinghouseState({ user });
  return {
    equity: Number(s.marginSummary.accountValue),
    withdrawable: Number(s.withdrawable),
    positions: s.assetPositions.map(({ position: p }) => ({
      coin: p.coin,
      szi: Number(p.szi),
      entryPx: Number(p.entryPx),
      unrealizedPnl: Number(p.unrealizedPnl),
      leverage: p.leverage.value,
      liquidationPx: p.liquidationPx ? Number(p.liquidationPx) : null,
    })),
  };
}

// ---------------------------------------------------------------- agent key

const storageKey = (user: string) => `spiderperps.agent.${NETWORK}.${user.toLowerCase()}`;

export function loadAgent(user: string): PrivateKeyAccount | null {
  try {
    const key = window.localStorage.getItem(storageKey(user));
    return key ? privateKeyToAccount(key as `0x${string}`) : null;
  } catch {
    return null;
  }
}

export function forgetAgent(user: string): void {
  try {
    window.localStorage.removeItem(storageKey(user));
  } catch {}
}

/** Create a trading key in this browser and have the user's wallet approve it (one signature). */
export async function enableTrading(user: `0x${string}`, provider: EIP1193Provider): Promise<PrivateKeyAccount> {
  const key = generatePrivateKey();
  const agent = privateKeyToAccount(key);
  const { ExchangeClient } = await sdk();
  const wallet = createWalletClient({ account: user, transport: custom(provider) });
  await new ExchangeClient({ transport: await transport(), wallet }).approveAgent({ agentAddress: agent.address, agentName: AGENT_NAME });
  window.localStorage.setItem(storageKey(user), key);
  return agent;
}

// ---------------------------------------------------------------- orders

export type OrderResult = { filledSize: number; avgPx: number | null; protection: string[] };

/** True when Hyperliquid no longer knows the agent (revoked, or replaced by another browser). */
export function isUnknownAgentError(e: unknown): boolean {
  return /does not exist/i.test(e instanceof Error ? e.message : String(e));
}

/**
 * IOC "market" order signed by the agent, with optional leverage update and native
 * take-profit / stop-loss trigger orders (grouping "normalTpsl": active once the entry fills).
 */
export async function placeMarketOrder(args: {
  agent: PrivateKeyAccount;
  market: Market;
  isBuy: boolean;
  size: number;
  mid: number;
  slippage: number;
  reduceOnly?: boolean;
  leverage?: number;
  takeProfit?: number | null;
  stopLoss?: number | null;
}): Promise<OrderResult> {
  const { agent, market: m, isBuy, mid, slippage, reduceOnly = false } = args;
  const size = roundSizeDown(args.size, m.szDecimals);
  if (size <= 0) throw new Error('Size rounds to zero for this market');
  const { ExchangeClient } = await sdk();
  const exchange = new ExchangeClient({ transport: await transport(), wallet: agent });

  if (!reduceOnly && args.leverage) {
    await exchange.updateLeverage({ asset: m.asset, isCross: true, leverage: Math.max(1, Math.min(args.leverage, m.maxLeverage)) });
  }

  type OrderParams = Parameters<typeof exchange.order>[0]['orders'][number];
  const orders: OrderParams[] = [
    {
      a: m.asset,
      b: isBuy,
      p: priceWire(marketPrice(mid, isBuy, slippage), m.szDecimals),
      s: sizeWire(size, m.szDecimals),
      r: reduceOnly,
      t: { limit: { tif: 'Ioc' } },
    },
  ];
  if (!reduceOnly) {
    for (const [trigger, tpsl] of [
      [args.takeProfit, 'tp'],
      [args.stopLoss, 'sl'],
    ] as const) {
      if (!trigger) continue;
      orders.push({
        a: m.asset,
        b: !isBuy,
        p: priceWire(triggerLimitPrice(trigger, !isBuy), m.szDecimals),
        s: sizeWire(size, m.szDecimals),
        r: true,
        t: { trigger: { isMarket: true, triggerPx: priceWire(trigger, m.szDecimals), tpsl } },
      });
    }
  }

  const res = await exchange.order({ orders, grouping: orders.length > 1 ? 'normalTpsl' : 'na' });
  const [entry, ...rest] = res.response.data.statuses as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const protection = rest.map((s) => (typeof s === 'string' ? s : Object.keys(s)[0]));
  if (entry && 'filled' in entry) {
    return { filledSize: Number(entry.filled.totalSz), avgPx: Number(entry.filled.avgPx), protection };
  }
  return { filledSize: 0, avgPx: null, protection };
}

/** The injected wallet the user connected with (MetaMask, or Phantom's EVM provider). */
export function injectedProvider(kind: 'metamask' | 'phantom' | 'other' | null): EIP1193Provider | null {
  const w = window as unknown as {
    ethereum?: EIP1193Provider & { isMetaMask?: boolean; providers?: (EIP1193Provider & { isMetaMask?: boolean })[] };
    phantom?: { ethereum?: EIP1193Provider };
  };
  if (kind === 'phantom') return w.phantom?.ethereum ?? w.ethereum ?? null;
  return w.ethereum?.providers?.find((p) => p.isMetaMask) ?? w.ethereum ?? null;
}
