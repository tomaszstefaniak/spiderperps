// Run with: npm run test:unit  (Node 22's built-in test runner + type stripping)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  marketPrice,
  minimumSize,
  priceWire,
  protectionPrices,
  roundPrice,
  roundSizeDown,
  sizeWire,
  toWire,
  triggerLimitPrice,
} from './order-math.ts';

test('prices keep 5 significant figures and at most 6 - szDecimals decimals', () => {
  assert.equal(roundPrice(104_123.7, 5), 104_120); // BTC: 5 sig figs
  assert.equal(roundPrice(4012.345, 4), 4012.3); // ETH
  assert.equal(roundPrice(0.0123456, 0), 0.012346); // kPEPE-like: 6 decimals cap
  assert.equal(roundPrice(1.234567, 2), 1.2346);
  assert.equal(roundPrice(12.34567, 3), 12.346);
  assert.equal(roundPrice(100_000, 5), 100_000); // integers are always allowed
});

test('wire strings have no trailing zeros or exponent', () => {
  assert.equal(priceWire(4000.0, 4), '4000');
  assert.equal(priceWire(0.0000123456, 0), '0.000012');
  assert.equal(toWire(0.1, 4), '0.1');
  assert.equal(toWire(1e-7, 8), '0.0000001');
});

test('sizes round down, never up', () => {
  assert.equal(roundSizeDown(0.123459, 5), 0.12345);
  assert.equal(roundSizeDown(0.15, 2), 0.15); // 0.15 * 100 float noise
  assert.equal(roundSizeDown(-2.9, 0), 2);
  assert.equal(sizeWire(0.0300000001, 4), '0.03');
});

test('market prices add slippage in the direction of the trade', () => {
  assert.equal(marketPrice(100, true, 0.01), 101);
  assert.equal(marketPrice(100, false, 0.01), 99);
});

test('stop-loss and take-profit sit on the right sides', () => {
  assert.deepEqual(protectionPrices(100, true, 5, 10), { stopLoss: 95, takeProfit: 110.00000000000001 });
  const short = protectionPrices(100, false, 5, 10);
  assert.equal(short.stopLoss, 105);
  assert.equal(short.takeProfit, 90);
  assert.deepEqual(protectionPrices(100, true, null, 0), {});
  // closing a long sells, so the worst fill is below the trigger
  assert.equal(triggerLimitPrice(95, false), 85.5);
  assert.ok(Math.abs(triggerLimitPrice(105, true) - 115.5) < 1e-9);
});

test('minimum size clears $10 notional', () => {
  const sz = minimumSize(4000, 4);
  assert.ok(sz * 4000 >= 10);
  assert.equal(sz, 0.0027); // $10.80
});
