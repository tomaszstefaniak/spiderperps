/**
 * Talks to Hyperliquid directly from the phone. Orders are signed here with the agent key -
 * the copy-trading server never sees a key or an order before it reaches Hyperliquid.
 */
import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { ApiRequestError, type OrderParameters } from '@nktkas/hyperliquid/api/exchange';
import type { PrivateKeyAccount } from 'viem/accounts';

import type { Proposal } from './api';
import type { Network } from './config';
import { marketPrice, priceWire, protectionPrices, roundSizeDown, sizeWire, triggerLimitPrice } from './order-math';

const transports: Partial<Record<Network, HttpTransport>> = {};

function transport(network: Network): HttpTransport {
  return (transports[network] ??= new HttpTransport({ isTestnet: network === 'testnet' }));
}

export function info(network: Network): InfoClient {
  return new InfoClient({ transport: transport(network) });
}

export type Market = { coin: string; asset: number; szDecimals: number; maxLeverage: number; mid: number };

export async function loadMarket(network: Network, coin: string): Promise<Market> {
  const client = info(network);
  const [meta, mids] = await Promise.all([client.meta(), client.allMids()]);
  const asset = meta.universe.findIndex((u) => u.name === coin);
  if (asset < 0 || meta.universe[asset].isDelisted) throw new Error(`${coin} is not tradable on ${network}`);
  const mid = Number(mids[coin]);
  if (!(mid > 0)) throw new Error(`No price for ${coin} on ${network}`);
  const u = meta.universe[asset];
  return { coin, asset, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage, mid };
}

export type AccountSummary = {
  equity: number;
  withdrawable: number;
  positions: { coin: string; szi: number; entryPx: number; unrealizedPnl: number; leverage: number }[];
};

export async function accountSummary(network: Network, user: `0x${string}`): Promise<AccountSummary> {
  const s = await info(network).clearinghouseState({ user });
  return {
    equity: Number(s.marginSummary.accountValue),
    withdrawable: Number(s.withdrawable),
    positions: s.assetPositions.map(({ position: p }) => ({
      coin: p.coin,
      szi: Number(p.szi),
      entryPx: Number(p.entryPx),
      unrealizedPnl: Number(p.unrealizedPnl),
      leverage: p.leverage.value,
    })),
  };
}

export type Execution = {
  filledSize: number;
  avgPx: number | null;
  oid: number | null;
  protection: string[]; // statuses of the attached stop-loss / take-profit orders
  warnings: string[];
};

export class ExecutionError extends Error {}

/**
 * Execute an approved proposal: set leverage (opens only), then one IOC "market" order with
 * the user's stop-loss / take-profit attached as native trigger orders (grouping
 * "normalTpsl" - they only activate once the entry fills).
 */
export async function executeProposal(args: {
  network: Network;
  agent: PrivateKeyAccount;
  proposal: Proposal;
  size: number;
  slippage: number;
}): Promise<Execution> {
  const { network, agent, proposal: p, slippage } = args;
  const exchange = new ExchangeClient({ transport: transport(network), wallet: agent });
  const m = await loadMarket(network, p.coin);
  const size = roundSizeDown(args.size, m.szDecimals);
  if (size <= 0) throw new ExecutionError('Size rounds to zero for this market');
  const warnings: string[] = [];

  if (!p.reduce_only && p.leverage) {
    const leverage = Math.max(1, Math.min(p.leverage, m.maxLeverage));
    try {
      await exchange.updateLeverage({ asset: m.asset, isCross: true, leverage });
    } catch (e) {
      // e.g. an existing isolated position on this coin: keep the account's current leverage
      warnings.push(`Leverage unchanged: ${errorMessage(e)}`);
    }
  }

  const orders: OrderParameters['orders'] = [
    {
      a: m.asset,
      b: p.is_buy,
      p: priceWire(marketPrice(m.mid, p.is_buy, slippage), m.szDecimals),
      s: sizeWire(size, m.szDecimals),
      r: p.reduce_only,
      t: { limit: { tif: 'Ioc' } },
    },
  ];
  if (!p.reduce_only) {
    const { stopLoss, takeProfit } = protectionPrices(m.mid, p.is_buy, p.sl_pct, p.tp_pct);
    for (const [trigger, tpsl] of [
      [stopLoss, 'sl'],
      [takeProfit, 'tp'],
    ] as const) {
      if (!trigger) continue;
      orders.push({
        a: m.asset,
        b: !p.is_buy,
        p: priceWire(triggerLimitPrice(trigger, !p.is_buy), m.szDecimals),
        s: sizeWire(size, m.szDecimals),
        r: true,
        t: { trigger: { isMarket: true, triggerPx: priceWire(trigger, m.szDecimals), tpsl } },
      });
    }
  }

  let statuses: unknown[];
  try {
    const res = await exchange.order({ orders, grouping: orders.length > 1 ? 'normalTpsl' : 'na' });
    statuses = res.response.data.statuses;
  } catch (e) {
    throw new ExecutionError(errorMessage(e));
  }
  const [entry, ...rest] = statuses as Record<string, any>[];
  const protection = rest.map((s) => (typeof s === 'string' ? s : Object.keys(s)[0]));
  if (entry && 'filled' in entry) {
    return {
      filledSize: Number(entry.filled.totalSz),
      avgPx: Number(entry.filled.avgPx),
      oid: entry.filled.oid,
      protection,
      warnings,
    };
  }
  // An IOC order either fills (fully or partly) or errors; anything else filled nothing.
  return { filledSize: 0, avgPx: null, oid: entry?.resting?.oid ?? null, protection, warnings };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
