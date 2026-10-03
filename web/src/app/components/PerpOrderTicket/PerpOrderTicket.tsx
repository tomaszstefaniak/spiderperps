'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './PerpOrderTicket.module.css';
import SwapSettingsModal from '../SwapSettingsModal/SwapSettingsModal';
import { useBalances } from '@/hooks/useBalances';
import MarketSelector from '../MarketSelector/MarketSelector';
import { useStickyNumber, fmtUsd } from '../_shared/useStickyNumber';
import MarkTicker from './MarkTicker';
import SwapInfoBox from '../SwapInfoBox/SwapInfoBox';

type Side = 'long' | 'short';
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const pretty = (n: number, dp = 6) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const log = (id: string, label: string, data?: any) => console.log(`[perp:${id}] ${label}`, data ?? '');

export default function PerpOrderTicket({ preset }: { preset?: { coin: string, side: Side, size?: number } | null }) {
  const { withdrawable, positions, refresh } = useBalances();

  // ticket state
  const [side, setSide] = useState<Side>('long');
  const [leverage, setLeverage] = useState<number>(1);
  const [size, setSize] = useState('');
  const [slippagePct, setSlippagePct] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  // quote/mark
  const [mark, setMark] = useState<number>(0);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  // submit state
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  // market selection
  const [symbol, setSymbol] = useState('ETH');
  const [markets, setMarkets] = useState<string[]>(['ETH']);

  // Preset effect
  useEffect(() => {
    if (preset) {
      setSymbol(preset.coin.toUpperCase());
      setSide(preset.side);
      // Maybe set size? User requirement said "amount should be changed by user... but should be known what is original".
      // I can set it but maybe user wants to scale it?
      // Use logic: if size is provided, set it as base size (assuming user copies exact amount).
      // User can edit it.
      // Assuming preset.size is base asset size.
      if (preset.size) setSize(String(preset.size));
    }
  }, [preset]);

  const stickyMark = useStickyNumber(mark);

  const [maxLeverage, setMaxLeverage] = useState<number>(10);

  // fetch markets list once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/perps/market', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const list = Array.isArray(j?.markets) ? j.markets : [];
        if (alive && list.length) {
          setMarkets(list);
          if (!list.includes(symbol)) setSymbol(list[0]);
        }
      } catch {
        // keep default ETH if route not available
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetch mark every 6s and on symbol change (reusing your existing /api/quote shape)
  useEffect(() => {
    let alive = true;
    const fetchMark = async () => {
      try {
        setQuoting(true);
        setQuoteErr(null);
        const r = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ inputSymbol: symbol, outputSymbol: 'USDC', amount: '1' }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || j?.detail || 'quote failed');
        const outRaw = Number(j?.outRaw ?? 0);
        if (alive) setMark(outRaw || 0);
      } catch (e: any) {
        if (alive) setQuoteErr(e?.message || 'quote failed');
      } finally {
        if (alive) setQuoting(false);
      }
    };
    fetchMark();
    const t = setInterval(fetchMark, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [symbol]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `/api/perps/max-leverage?symbol=${encodeURIComponent(symbol)}`,
          { cache: 'no-store' }
        );
        const j = await r.json();
        const mx = Math.max(1, Number(j?.max ?? 10));
        if (alive) setMaxLeverage(mx);
      } catch {
        if (alive) setMaxLeverage(10);
      }
    })();
    return () => { alive = false; };
  }, [symbol]);

  // keep current leverage within the new cap
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

  const canSubmit = useMemo(
    () => isFinite(sizeNum) && sizeNum > 0 && mark > 0 && !busy,
    [sizeNum, mark, busy]
  );

  const buttonLabel = busy
    ? 'Submitting…'
    : blockMsg
      ? 'Blocked'
      : (canSubmit ? 'Open Position' : 'Enter an amount');

  // clear blockers/notices when user edits
  useEffect(() => { setBlockMsg(null); setNotice(null); }, [symbol, side, size, leverage]);

  const doSubmit = useCallback(async () => {
    const reqId = rid();
    setBusy(true);
    setBlockMsg(null);
    setNotice('Placing order…');

    try {
      const payload = {
        coin: symbol.toUpperCase(),
        side: side === 'long' ? ('buy' as const) : ('sell' as const),
        size: baseSize,
        slippage,
      };
      log(reqId, 'submit', payload);

      const res = await fetch('/api/perps/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const txt = await res.text();
      let body: any; try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
      log(reqId, 'response', { ok: res.ok, status: res.status, body });

      if (!res.ok) {
        const msg = body?.error || body?.detail || body?.raw || `Order failed (HTTP ${res.status})`;
        // user-fixable rejects → block button
        if (res.status === 409 && /open interest|interest.*cap|ioc|immediately match|liquidity/i.test(msg)) {
          setBlockMsg(msg);
          setNotice(null); // avoid double (green) notice
        } else {
          setNotice(msg);
        }
        return;
      }

      // success
      const { accepted = false, filled = false } = body ?? {};
      setBlockMsg(null);
      if (filled) setNotice('Order filled!');
      else if (accepted) setNotice('Order placed…checking fill');
      else setNotice('Order sent!');

      setSize('');
      (async () => {
        for (let i = 0; i < 6; i++) {     // ~3s total
          await new Promise(r => setTimeout(r, 500));
          await refresh();
        }
      })();
    } catch (e: any) {
      setNotice(e?.message || 'Order failed');
    } finally {
      setBusy(false);
    }
  }, [symbol, side, baseSize, slippage, refresh]);

  // keep pos for the per-market Position line
  const pos = useMemo(() => {
    const p = (positions || []).find(
      (pp) => String(pp.coin ?? '').toUpperCase() === symbol.toUpperCase(),
    );
    if (!p) return null;
    const szi = Number(p.szi ?? 0);
    const uPnl = Number(p.unrealizedPnl ?? 0);
    return { szi, uPnl: Number.isFinite(uPnl) ? uPnl : 0 };
  }, [positions, symbol]);

  // NEW: sum uPnL across *all* positions
  const allUPnL = useMemo(() => {
    return (positions || []).reduce((sum, pp) => {
      const v = Number(pp.unrealizedPnl ?? 0);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [positions]);

  const totalBalance = (Number(withdrawable) || 0) + allUPnL;

  // treat notices that mention liquidity / cap as error
  const isErrorNotice =
    !!blockMsg || /timeout|failed|reject|unavail|error|liquidity|interest|cap|http/i.test(String(notice || ''));

  const marketIconUrl = useMemo(
    () => `https://app.hyperliquid.xyz/coins/${symbol.toUpperCase()}.svg`,
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
            {quoteErr && <div className={`${styles.notice} ${styles.error}`}>{quoteErr}</div>}

            {/* Submit */}
            <button
              className={styles.swapButton}
              onClick={doSubmit}
              disabled={!canSubmit || !!blockMsg}
              title={!canSubmit ? 'Enter amount' : blockMsg ? blockMsg : 'Open position'}
              aria-disabled={!canSubmit || !!blockMsg}
            >
              {buttonLabel}
            </button>
          </div>

          {/* TP/SL info box — same width as the ticket, with a small gap */}
          <div className={styles.swapInfoWrap}>
            <SwapInfoBox
              rateLabel="Take Profit • Stop Loss"
              badgeLabel="0.05% fee"
              entryPrice={mark || undefined}
              side={side}
              size={baseSize}
              leverage={leverage}
              onChange={() => { }}
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