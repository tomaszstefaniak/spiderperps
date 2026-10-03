'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './PerpOrderTicket.module.css';
import SwapSettingsModal from '../SwapSettingsModal/SwapSettingsModal';
import { useBalances } from '@/hooks/useBalances';
import MarketSelector from '../MarketSelector/MarketSelector';
import MarkTicker from './MarkTicker';
import SwapInfoBox, { type Protection } from '../SwapInfoBox/SwapInfoBox';
import { useLiveMids } from '../_shared/LiveMidsContext';
import { useWallet } from '@/app/context/WalletContext';
import {
  NETWORK,
  enableTrading,
  forgetAgent,
  injectedProvider,
  isUnknownAgentError,
  loadAgent,
  loadMarkets,
  placeMarketOrder,
  type Market,
} from '@/lib/hl-browser';

type Side = 'long' | 'short';
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const pretty = (n: number, dp = 6) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function PerpOrderTicket({ preset }: { preset?: { coin: string, side: Side, size?: number } | null }) {
  const { address, providerType } = useWallet();
  const { withdrawable, positions, refresh } = useBalances();
  const mids = useLiveMids();

  // ticket state
  const [side, setSide] = useState<Side>('long');
  const [leverage, setLeverage] = useState<number>(1);
  const [size, setSize] = useState('');
  const [slippagePct, setSlippagePct] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [protection, setProtection] = useState<Protection>({ takeProfit: null, stopLoss: null });

  // submit state
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  // market selection: straight from Hyperliquid's perp universe
  const [symbol, setSymbol] = useState('ETH');
  const [marketList, setMarketList] = useState<Market[]>([]);
  const [marketError, setMarketError] = useState<string | null>(null);
  const markets = useMemo(() => marketList.map((m) => m.name), [marketList]);
  const market = useMemo(() => marketList.find((m) => m.name === symbol) ?? null, [marketList, symbol]);
  const maxLeverage = market?.maxLeverage ?? 10;
  const mark = mids[symbol] ?? 0;

  // the browser's trading key for this wallet (null until "Enable trading")
  const [agentVersion, setAgentVersion] = useState(0);
  const agent = useMemo(() => (address ? loadAgent(address) : null), [address, agentVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preset: "Copy" from a watched wallet's position fills the ticket; the size stays editable.
  useEffect(() => {
    if (!preset) return;
    setSymbol(preset.coin);
    setSide(preset.side);
    if (preset.size) setSize(String(preset.size));
  }, [preset]);

  useEffect(() => {
    let alive = true;
    loadMarkets()
      .then((list) => {
        if (!alive || !list.length) return;
        setMarketList(list);
        setSymbol((s) => (list.some((m) => m.name === s) ? s : list[0].name));
      })
      .catch((e) => alive && setMarketError(errorText(e)));
    return () => { alive = false; };
  }, []);

  // keep current leverage within the market's cap
  useEffect(() => {
    setLeverage((prev) => Math.min(prev, maxLeverage));
  }, [maxLeverage]);

  const slippage = clamp(slippagePct, 0, 5) / 100;

  const [sizeMode, setSizeMode] = useState<'base' | 'quote'>('base');

  const sizeNum = Number(size || '0');

  const baseSize = useMemo(() => {
    if (sizeMode === 'base') return sizeNum;              // user typed base units
    if (mark <= 0 || leverage <= 0) return 0;
    // user typed collateral → base size = (collateral * leverage) / price
    return (sizeNum * leverage) / mark;
  }, [sizeNum, sizeMode, mark, leverage]);

  const notional = useMemo(() => {
    if (mark <= 0) return 0;
    // base mode: notional = base * price; quote mode: notional = collateral * leverage
    return sizeMode === 'base' ? sizeNum * mark : sizeNum * leverage;
  }, [sizeNum, sizeMode, mark, leverage]);

  const requiredCollateral = useMemo(() => {
    // base mode: derive; quote mode: input IS the collateral
    return sizeMode === 'base' ? (leverage > 0 ? notional / leverage : 0) : sizeNum;
  }, [sizeMode, notional, leverage, sizeNum]);

  const isLong = side === 'long';
  // TP/SL must sit on the right side of the current price, or they'd fire immediately.
  const protectionError =
    mark > 0 && protection.stopLoss != null && (isLong ? protection.stopLoss >= mark : protection.stopLoss <= mark)
      ? `Stop-loss must be ${isLong ? 'below' : 'above'} the current price.`
      : mark > 0 && protection.takeProfit != null && (isLong ? protection.takeProfit <= mark : protection.takeProfit >= mark)
        ? `Take-profit must be ${isLong ? 'above' : 'below'} the current price.`
        : null;

  const canSubmit = isFinite(sizeNum) && sizeNum > 0 && mark > 0 && !!market && !busy && !protectionError;

  const buttonLabel = busy
    ? 'Submitting…'
    : !address
      ? 'Connect a wallet to trade'
      : !agent
        ? 'Enable trading'
        : blockMsg
          ? 'Blocked'
          : (canSubmit ? 'Open Position' : 'Enter an amount');

  // clear blockers/notices when user edits
  useEffect(() => { setBlockMsg(null); setNotice(null); }, [symbol, side, size, leverage]);

  const doEnableTrading = useCallback(async () => {
    if (!address) return;
    const provider = injectedProvider(providerType);
    if (!provider) { setNotice('No wallet found in this browser.'); return; }
    setBusy(true);
    setNotice('Approve the trading key in your wallet…');
    try {
      await enableTrading(address as `0x${string}`, provider);
      setAgentVersion((v) => v + 1);
      setNotice(`Trading enabled on ${NETWORK}. This browser can now place orders; it can never withdraw.`);
    } catch (e) {
      setNotice(`Enable trading failed: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }, [address, providerType]);

  const doSubmit = useCallback(async () => {
    if (!agent || !market) return;
    setBusy(true);
    setBlockMsg(null);
    setNotice('Placing order…');
    try {
      const r = await placeMarketOrder({
        agent,
        market,
        isBuy: isLong,
        size: baseSize,
        mid: mark,
        slippage,
        leverage,
        takeProfit: protection.takeProfit,
        stopLoss: protection.stopLoss,
      });
      if (r.filledSize > 0) {
        setNotice(`Filled ${pretty(r.filledSize)} ${symbol} at ${pretty(r.avgPx ?? 0, 6)}${r.protection.length ? ' · TP/SL set' : ''}`);
        setSize('');
      } else {
        setBlockMsg('Nothing filled: the price moved beyond your slippage. Try a wider slippage.');
      }
      for (let i = 0; i < 4; i++) {
        await new Promise((res) => setTimeout(res, 750));
        await refresh();
      }
    } catch (e) {
      if (address && isUnknownAgentError(e)) {
        forgetAgent(address);
        setAgentVersion((v) => v + 1);
        setNotice('This browser\'s trading key was revoked or replaced. Enable trading again.');
      } else {
        setNotice(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }, [agent, market, isLong, baseSize, mark, slippage, leverage, protection, symbol, refresh, address]);

  // keep pos for the per-market Position line
  const pos = useMemo(() => {
    const p = positions.find((pp) => pp.coin === symbol);
    return p ? { szi: p.szi, uPnl: p.unrealizedPnl } : null;
  }, [positions, symbol]);

  // treat notices that mention liquidity / cap as error
  const isErrorNotice =
    !!blockMsg || /timeout|failed|reject|unavail|error|liquidity|interest|cap|http|revoked|no wallet/i.test(String(notice || ''));

  const marketIconUrl = useMemo(
    () => `https://app.hyperliquid.xyz/coins/${symbol}.svg`,
    [symbol]
  );

  const usdcIconUrl = '/usdc.svg';

  return (
    <>
      <div className={styles.swapContainer}>
        {/* Column wrapper so the card and the info box share the same width */}
        <div className={styles.ticketColumn}>
          {/* Ticket card */}
          <div className={styles.swapCard}>
            {/* Settings */}
            <div
              className={styles.swapSettingsIcon}
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <img src="/assets/images/gear-8.svg" alt="Settings" className={styles.gearIcon} />
            </div>

            {/* Header */}
            <div className={styles.headerGrid}>
              <div className={styles.headerLeft}>
                <MarketSelector value={symbol} options={markets} onChange={setSymbol} />
              </div>

              <div className={styles.headerRight}>
                <MarkTicker value={mark} />
                <div className={styles.walletLines}>
                  <div>Available: {pretty(withdrawable, 2)} USDC</div>
                </div>
              </div>
            </div>

            {/* Side selector */}
            <div className={styles.sideButtons}>
              <button
                className={`${styles.sideButton} ${side === 'long' ? styles.longActive : ''}`}
                onClick={() => setSide('long')}
              >
                Long
              </button>
              <button
                className={`${styles.sideButton} ${side === 'short' ? styles.shortActive : ''}`}
                onClick={() => setSide('short')}
              >
                Short
              </button>
            </div>

            {/* Size row */}
            <div className={styles.swapRow}>
              <div className={styles.swapInputWrap}>
                <input
                  className={styles.swapInput}
                  placeholder={sizeMode === 'base' ? '0.0' : '0.00'}
                  inputMode="decimal"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  aria-label={sizeMode === 'base' ? `${symbol} amount` : `USDC amount`}
                />

                {/* Denomination toggle */}
                <div className={styles.denomToggle} role="tablist" aria-label="Input denomination">
                  <button
                    type="button"
                    className={`${styles.denomBtn} ${sizeMode === 'base' ? styles.denomActive : ''}`}
                    onClick={() => setSizeMode('base')}
                    aria-selected={sizeMode === 'base'}
                    title={symbol}
                  >
                    <img
                      className={styles.denomIcon}
                      src={marketIconUrl}
                      alt=""
                      width={16}
                      height={16}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/unknown.svg'; }}
                    />
                    <span className={styles.denomLabel}>{symbol}</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.denomBtn} ${sizeMode === 'quote' ? styles.denomActive : ''}`}
                    onClick={() => setSizeMode('quote')}
                    aria-selected={sizeMode === 'quote'}
                    title="USDC"
                  >
                    <img
                      className={styles.denomIcon}
                      src={usdcIconUrl}
                      alt=""
                      width={16}
                      height={16}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/usdc.svg'; }}
                    />
                    <span className={styles.denomLabel}>USDC</span>
                  </button>
                </div>
              </div>

              {/* Exposure + margin */}
              <div className={styles.balanceLine}>
                Exposure ≈ {pretty(notional, 2)} USDC
                <span className={styles.dot}>•</span>
                Margin used ≈ {pretty(requiredCollateral, 2)} USDC
              </div>

              {/* Size (only when user typed USDC) */}
              {sizeMode === 'quote' && (
                <div className={`${styles.balanceLine} ${styles.sizeLine}`}>
                  Size ≈ {pretty(baseSize, 6)} {symbol}
                </div>
              )}
            </div>

            {/* Leverage (slider + stepper) */}
            <div className={styles.levRow}>
              <div className={styles.levHeader}>
                <div className={styles.levTitle}>Leverage</div>
                <div className={styles.levBadge}>Max {maxLeverage}×</div>
              </div>

              <div className={styles.levControl}>
                <input
                  type="range"
                  className={styles.range}
                  min={1}
                  max={maxLeverage}
                  step={1}
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  aria-label="Leverage"
                />
                <div className={styles.stepper} aria-live="polite">
                  <button
                    type="button"
                    onClick={() => setLeverage((v) => Math.max(1, v - 1))}
                    aria-label="Decrease leverage"
                  >
                    −
                  </button>
                  <span className={styles.stepperValue}>{leverage}×</span>
                  <button
                    type="button"
                    onClick={() => setLeverage((v) => Math.min(maxLeverage, v + 1))}
                    aria-label="Increase leverage"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className={styles.levNote}>
                Higher leverage increases the liquidation risk.
              </div>
            </div>

            {/* Position (optional) */}
            {pos && (
              <div className={styles.balanceLine}>
                Position: {pos.szi > 0 ? '+' : ''}{pretty(pos.szi, 6)} {symbol}
              </div>
            )}

            {/* Notices */}
            {blockMsg && (
              <div className={`${styles.notice} ${styles.error}`} role="alert">
                {blockMsg}
              </div>
            )}
            {notice && !blockMsg && (
              <div className={`${styles.notice} ${isErrorNotice ? styles.error : styles.success}`}>
                {notice}
              </div>
            )}
            {(marketError || protectionError) && (
              <div className={`${styles.notice} ${styles.error}`}>{protectionError ?? marketError}</div>
            )}

            {/* Submit */}
            <button
              className={styles.swapButton}
              onClick={agent ? doSubmit : doEnableTrading}
              disabled={!address || busy || (!!agent && (!canSubmit || !!blockMsg))}
              title={!agent ? 'Approve a trading key for this browser (one signature, it can never withdraw)' : blockMsg ?? 'Open position'}
            >
              {buttonLabel}
            </button>
          </div>

          {/* TP/SL info box — same width as the ticket, with a small gap */}
          <div className={styles.swapInfoWrap}>
            <SwapInfoBox
              rateLabel="Take Profit • Stop Loss"
              badgeLabel={protection.takeProfit || protection.stopLoss ? 'TP/SL on' : 'TP/SL'}
              entryPrice={mark || undefined}
              side={side}
              size={baseSize}
              leverage={leverage}
              onChange={setProtection}
            />
          </div>
        </div>
      </div>

      {/* Settings modal */}
      <SwapSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        slippage={slippagePct}
        setSlippage={setSlippagePct}
        speed={'turbo' as any}
        setSpeed={() => { }}
      />
    </>
  );
}