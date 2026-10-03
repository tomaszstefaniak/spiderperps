// Kept identical to mobile/src/lib/order-math.ts (same tests: order-math.test.ts).
/**
 * Hyperliquid order arithmetic. Pure functions, unit-tested in order-math.test.ts.
 *
 * Perp prices may have at most 5 significant figures and at most (6 - szDecimals) decimals;
 * integer prices are always allowed. Sizes are rounded *down* to szDecimals so a copy never
 * exceeds what was proposed.
 */

const PERP_MAX_DECIMALS = 6;

/** Number -> canonical decimal string without exponent or trailing zeros ("0.0100" -> "0.01"). */
export function toWire(x: number, decimals: number): string {
  const fixed = x.toFixed(Math.max(0, Math.min(decimals, 20)));
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Round a price to what Hyperliquid accepts for a perp with `szDecimals` (mirrors the Python SDK). */
export function roundPrice(px: number, szDecimals: number): number {
  if (!(px > 0)) throw new Error(`invalid price ${px}`);
  const decimals = Math.max(0, PERP_MAX_DECIMALS - szDecimals);
  if (Number.isInteger(px)) return px;
  const sig5 = Number(px.toPrecision(5));
  return Number(sig5.toFixed(decimals));
}

export function priceWire(px: number, szDecimals: number): string {
  return toWire(roundPrice(px, szDecimals), Math.max(0, PERP_MAX_DECIMALS - szDecimals));
}

/** Round a size down to szDecimals. */
export function roundSizeDown(size: number, szDecimals: number): number {
  const q = 10 ** szDecimals;
  // the epsilon absorbs float noise like 0.15 * 100 = 14.999999999999998
  return Math.floor(Math.abs(size) * q + 1e-9) / q;
}

export function sizeWire(size: number, szDecimals: number): string {
  return toWire(roundSizeDown(size, szDecimals), szDecimals);
}

/** Aggressive limit price for an IOC "market" order. */
export function marketPrice(mid: number, isBuy: boolean, slippage: number): number {
  return mid * (isBuy ? 1 + slippage : 1 - slippage);
}

export type ProtectionPrices = { stopLoss?: number; takeProfit?: number };

/**
 * Stop-loss / take-profit trigger prices for a position entered at `entry`.
 * Percentages are price moves (not PnL): a 5% stop on a 5x long loses ~25% of its margin.
 */
export function protectionPrices(entry: number, isLong: boolean, slPct?: number | null, tpPct?: number | null): ProtectionPrices {
  const out: ProtectionPrices = {};
  if (slPct && slPct > 0) out.stopLoss = entry * (isLong ? 1 - slPct / 100 : 1 + slPct / 100);
  if (tpPct && tpPct > 0) out.takeProfit = entry * (isLong ? 1 + tpPct / 100 : 1 - tpPct / 100);
  return out;
}

/** Worst acceptable fill once a market trigger fires (it closes the position, so the opposite side). */
export function triggerLimitPrice(trigger: number, closingIsBuy: boolean, slippage = 0.1): number {
  return trigger * (closingIsBuy ? 1 + slippage : 1 - slippage);
}

export const MIN_NOTIONAL_USD = 10;

/** Smallest size whose notional clears Hyperliquid's $10 minimum (with a small buffer for price moves). */
export function minimumSize(mid: number, szDecimals: number, buffer = 1.05): number {
  const q = 10 ** szDecimals;
  return Math.ceil(((MIN_NOTIONAL_USD * buffer) / mid) * q) / q;
}
