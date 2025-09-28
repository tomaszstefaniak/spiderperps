'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './SwapPanel.module.css';

import SwapRow from '../SwapRow/SwapRow';
import SwapInfoBox from '../SwapInfoBox/SwapInfoBox';
import SwapSettingsModal from '../SwapSettingsModal/SwapSettingsModal';

import { useTokens } from '@/hooks/useTokens';
import { useBalances } from '@/hooks/useBalances';
import { FEE_RATE } from '@/utils/config';

import SelectTokenModalSmart from '../SelectTokenModal/SelectTokenModalSmart';

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const pretty = (n: number, dp = 6) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });

type SwapResp =
  | { ok: true; accepted: true; orderId?: string; provider?: any }
  | { ok: false; error: string; code?: number; provider?: any };

export default function SwapPanel() {
  // data hooks
  const { tokens, isLoading: tokensLoading } = useTokens();
  const { balances, isLoading: balLoading, refresh: refreshBalances } = useBalances();

  // ui state
  const [fromSym, setFromSym] = useState('USDC');
  const [toSym, setToSym] = useState('ETH');
  const [amountIn, setAmountIn] = useState('');
  const [slippagePct, setSlippagePct] = useState(1);   // UI in %
  const [speed, setSpeed] = useState<'fast' | 'turbo' | 'ultra'>('turbo');
  const [showSettings, setShowSettings] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // MVP constraint: one side must be USDC and symbols must differ
  useEffect(() => {
    const f = fromSym.toUpperCase();
    const t = toSym.toUpperCase();
    if (f === t) {
      if (f === 'USDC') setToSym('ETH');
      else setToSym('USDC');
    } else if (f !== 'USDC' && t !== 'USDC') {
      setFromSym('USDC');
      setToSym('ETH');
    }
  }, [fromSym, toSym]);

  // balances
  const safeBal = (sym: string) => Math.max(0, balances[sym.toUpperCase()] ?? 0);
  const fromBal = safeBal(fromSym);

  // quote state
  const [quoteOut, setQuoteOut] = useState<number>(0);
  const [priceImpact, setPriceImpact] = useState<string>('0.00%');
  const [routeCount, setRouteCount] = useState<number>(0);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  const canQuote = useMemo(() => {
    const a = Number(amountIn);
    return isFinite(a) && a > 0 && !tokensLoading;
  }, [amountIn, tokensLoading]);

  // quote
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!canQuote) {
        setQuoteOut(0);
        setQuoteErr(null);
        return;
      }
      setQuoting(true);
      setQuoteErr(null);
      try {
        const r = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            inputSymbol: fromSym,
            outputSymbol: toSym,
            amount: amountIn,
          }),
        });
        const text = await r.text();
        const j = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
        if (!r.ok) throw new Error(j?.error || j?.detail || j?.raw || `HTTP ${r.status}`);

        if (!alive) return;
        setQuoteOut(Number(j.outRaw ?? 0));
        setPriceImpact(String(j.priceImpact ?? '0.00%'));
        setRouteCount(Number(j.routeCount ?? 0));
      } catch (e: any) {
        if (!alive) return;
        setQuoteOut(0);
        setQuoteErr(e?.message || 'Quote failed');
      } finally {
        if (!alive) return;
        setQuoting(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [fromSym, toSym, amountIn, canQuote]);

  // derived ui
  const rateLabel = useMemo(() => {
    const aIn = Number(amountIn || '0');
    if (!aIn || !quoteOut) return '';
    if (fromSym.toUpperCase() === 'USDC') {
      return `1 USDC ≈ ${pretty(quoteOut / aIn)} ${toSym.toUpperCase()}`;
    }
    return `1 ${fromSym.toUpperCase()} ≈ ${pretty(aIn / quoteOut)} USDC`;
  }, [fromSym, toSym, amountIn, quoteOut]);

  const onFlip = () => {
    setFromSym(toSym);
    setToSym(fromSym);
    setAmountIn('');
    setQuoteOut(0);
    setQuoteErr(null);
  };

  // swap
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapNotice, setSwapNotice] = useState<string | null>(null);

  const pollStatus = useCallback(async (orderId: string) => {
    // poll up to ~20s total
    for (let i = 0; i < 10; i++) {
      try {
        const r = await fetch(`/api/order-status?orderId=${encodeURIComponent(orderId)}`);
        const j = await r.json();
        const status = (j?.status || '').toLowerCase();
        if (status === 'filled') return 'filled';
        if (status === 'rejected' || status === 'cancelled') return status;
      } catch {/* ignore and retry */}
      await new Promise(res => setTimeout(res, 2000));
    }
    return 'unknown';
  }, []);

  const doSwap = useCallback(async () => {
    setSwapBusy(true);
    setSwapNotice('Placing order…');

    try {
      const r = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inputSymbol: fromSym,
          outputSymbol: toSym,
          amount: Number(amountIn),
          slippage: clamp(slippagePct, 0, 5) / 100, // UI % → fraction
        }),
      });

      const res: SwapResp = await r.json();

      if (!res.ok) {
        if ((res as any).error === 'upstream_timeout') {
          setSwapNotice('Upstream timeout');
        } else if ((res as any).error === 'client_timeout') {
          setSwapNotice('Request timed out');
        } else {
          setSwapNotice((res as any).error || 'Swap failed');
        }
        return;
      }

      // Accepted
      if (res.orderId) {
        setSwapNotice('Order placed…checking fill…');
        const outcome = await pollStatus(res.orderId);
        if (outcome === 'filled') {
          setSwapNotice('Filled!');
          setAmountIn('');
          setQuoteOut(0);
          await refreshBalances();
        } else if (outcome === 'rejected') {
          setSwapNotice('Order rejected');
        } else if (outcome === 'cancelled') {
          setSwapNotice('Order cancelled');
        } else {
          setSwapNotice('Order placed (no fill yet)');
        }
      } else {
        // Accepted but no id – refresh balances a couple times; testnet often still fills
        setSwapNotice('Order placed (provider returned no id)…checking fill');
        await new Promise(res => setTimeout(res, 1500));
        await refreshBalances();
        await new Promise(res => setTimeout(res, 3000));
        await refreshBalances();
        setSwapNotice('Order placed (no fill yet)');
        setAmountIn('');
        setQuoteOut(0);
      }
    } catch (e: any) {
      setSwapNotice(e?.message || 'Swap failed');
    } finally {
      setSwapBusy(false);
    }
  }, [fromSym, toSym, amountIn, slippagePct, refreshBalances, pollStatus]);

  // button state
  let swapDisabled = false;
  let swapLabel = swapBusy ? 'Swapping…' : 'Swap';
  const aIn = Number(amountIn || '0');

  if (tokensLoading)           { swapDisabled = true; swapLabel = 'Loading tokens…'; }
  else if (!canQuote)          { swapDisabled = true; swapLabel = 'Enter an amount'; }
  else if (quoteErr)           { swapDisabled = true; swapLabel = 'Quote unavailable'; }
  else if (quoting)            { swapDisabled = true; swapLabel = 'Updating quote…'; }
  else if (routeCount === 0)   { swapDisabled = true; swapLabel = 'No route'; }
  else if (aIn > fromBal)      { swapDisabled = true; swapLabel = `Insufficient ${fromSym}`; }
  else if (fromSym.toUpperCase() !== 'USDC' && toSym.toUpperCase() !== 'USDC') {
                                swapDisabled = true; swapLabel = 'USDC pairs only'; }

  const balanceStr = (sym: string) => String(safeBal(sym));

  return (
    <div className={styles.swapContainer}>
      <div className={styles.swapCard}>
        {/* Settings (gear) */}
        <div className={styles.swapSettingsIcon} onClick={() => setShowSettings(true)}>
          <img src="/assets/images/gear-8.svg" alt="Settings" className={styles.gearIcon} />
        </div>

        {/* From */}
        <SwapRow
          label="Sell"
          amount={amountIn}
          tokenSymbol={fromSym}
          disabled={tokensLoading}
          balance={balanceStr(fromSym)}
          showBalance={!balLoading}
          onAmountChange={setAmountIn}
          onOpenSelector={() => setShowFromPicker(true)}
        />

        {/* Flip */}
        <div className={styles.swapArrow}>
          <button className={styles.arrowButton} onClick={onFlip}>
            <img src="/assets/arrow-2.svg" alt="Flip" className={styles.arrowIcon} />
          </button>
        </div>

        {/* To */}
        <SwapRow
          label="Buy"
          amount={quoteOut ? pretty(quoteOut) : ''}
          tokenSymbol={toSym}
          disabled={tokensLoading}
          balance={balanceStr(toSym)}
          showBalance={!balLoading}
          onOpenSelector={() => setShowToPicker(true)}
        />

        {/* Notices */}
        {!!swapNotice && <div className={`${styles.notice} ${/timeout|failed|reject|unavail/i.test(swapNotice) ? styles.error : styles.success}`}>{swapNotice}</div>}
        {!!quoteErr && <div className={`${styles.notice} ${styles.error}`}>{quoteErr}</div>}

        {/* Swap */}
        <button className={styles.swapButton} onClick={doSwap} disabled={swapDisabled || swapBusy}>
          {swapLabel}
        </button>
      </div>

      {/* Info pill / drawer */}
      <div className={styles.infoBoxWrapper}>
        <SwapInfoBox
          rateLabel={rateLabel}
          feeLabel={`${(FEE_RATE * 100).toFixed(2)}% fee`}
          networkFeeLabel="—"
          poolFeeLabel={routeCount ? `${(routeCount * 0.00).toFixed(2)}%` : '—'}
          priceImpactLabel={priceImpact}
          routeCount={routeCount}
          routerLabel="Hyperliquid"
        />
      </div>

      {/* Settings modal */}
      <SwapSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        slippage={slippagePct}
        setSlippage={setSlippagePct}
        speed={speed}
        setSpeed={setSpeed}
      />

      {/* Select token modals */}
      <SelectTokenModalSmart
        visible={showFromPicker}
        onClose={() => setShowFromPicker(false)}
        onSelect={(sym) => {
          const S = sym.toUpperCase();
          setFromSym(S);
          if (S !== 'USDC') setToSym('USDC');   // enforce USDC ↔ coin (MVP)
          setAmountIn('');
          setQuoteOut(0);
        }}
      />
      <SelectTokenModalSmart
        visible={showToPicker}
        onClose={() => setShowToPicker(false)}
        onSelect={(sym) => {
          const S = sym.toUpperCase();
          setToSym(S);
          if (S !== 'USDC') setFromSym('USDC'); // enforce USDC ↔ coin (MVP)
          setQuoteOut(0);
        }}
      />
    </div>
  );
}
