// src/app/components/PerpOrderTicket/PerpOrderTicket.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../SwapPanel/SwapPanel.module.css';

import SwapSettingsModal from '../SwapSettingsModal/SwapSettingsModal';
import { useBalances } from '@/hooks/useBalances';
import MarketSelector from '../MarketSelector/MarketSelector';

type Side = 'long' | 'short';

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const pretty = (n: number, dp = 6) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });

// small log helper to keep the console readable
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const log = (id: string, label: string, data?: any) => {
  // eslint-disable-next-line no-console
  console.log(`[perp:${id}] ${label}`, data ?? '');
};

export default function PerpOrderTicket() {
  const id = useMemo(rid, []);
  const { withdrawable, positions, refresh } = useBalances();

  // ticket state
  const [side, setSide] = useState<Side>('long');       // long/short
  const [leverage, setLeverage] = useState<number>(1);  // x1 default
  const [size, setSize] = useState('');                 // coin size (e.g., 0.05 ETH)
  const [slippagePct, setSlippagePct] = useState(1);    // %
  const [showSettings, setShowSettings] = useState(false);

  // quote/mark
  const [mark, setMark] = useState<number>(0);          // USDC per coin
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  // submit state
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // market selection
  const [symbol, setSymbol] = useState('ETH');                 // traded perp coin
  const [markets, setMarkets] = useState<string[]>(['ETH']);   // default until fetched

  // fetch markets list once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/perps/markets', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'markets error');
        const list = Array.isArray(j?.markets) ? j.markets : [];
        if (alive && list.length) {
          setMarkets(list);
          if (!list.includes(symbol)) setSymbol(list[0]);
        }
      } catch {
        // keep default ETH
      }
    })();
    return () => { alive = false; };
  }, []);

  // fetch mark every 6s and on symbol change
  useEffect(() => {
    let alive = true;

    const fetchMark = async () => {
      try {
        setQuoting(true);
        setQuoteErr(null);
        // reuse your /api/quote by asking for 1 coin → USDC out
        const r = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            inputSymbol: symbol,
            outputSymbol: 'USDC',
            amount: '1',
          }),
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
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [symbol]);

  const sizeNum = Number(size || '0');
  const slippage = clamp(slippagePct, 0, 5) / 100;

  // notional and required collateral (simple x1/xL approximation, fees ignored here)
  const notional = useMemo(() => sizeNum * mark, [sizeNum, mark]);
  const requiredCollateral = useMemo(() => (leverage > 0 ? notional / leverage : 0), [notional, leverage]);

  const canSubmit = useMemo(() => {
    return isFinite(sizeNum) && sizeNum > 0 && mark > 0 && !busy;
  }, [sizeNum, mark, busy]);

  const sideLabel = side === 'long' ? 'Buy / Long' : 'Sell / Short';
  const buttonLabel = busy ? 'Submitting…' : (canSubmit ? 'Open Position' : 'Enter an amount');

  const doSubmit = useCallback(async () => {
    const reqId = rid();
    try {
      setBusy(true);
      setNotice('Placing order…');

      log(reqId, 'submit', { symbol, side, size: sizeNum, leverage, slippage });

      // server expects { coin, side: "buy" | "sell", size, slippage }
      const payload = {
        coin: symbol.toUpperCase(),
        side: side === 'long' ? ('buy' as const) : ('sell' as const),
        size: sizeNum,       // base coin amount
        slippage,            // fraction
      };

      const r = await fetch('/api/perps/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      let body: any = null;
      try { body = JSON.parse(txt); } catch { body = { raw: txt }; }

      log(reqId, 'response', { ok: r.ok, status: r.status, body });

      if (!r.ok) {
        throw new Error(body?.error || body?.detail || body?.raw || `HTTP ${r.status}`);
      }

      const filled = !!body?.filled;
      const accepted = !!body?.accepted;

      if (filled) setNotice('Swap filled!');
      else if (accepted) setNotice('Order placed…checking fill');
      else setNotice('Order sent!');

      // clear input and refresh balances a bit later
      setSize('');
      setTimeout(() => {
        log(reqId, 'refreshing balances…');
        refresh();
      }, 400);
    } catch (e: any) {
      setNotice(e?.message || 'Order failed');
    } finally {
      setBusy(false);
    }
  }, [symbol, side, sizeNum, slippage, leverage, refresh]);

  // simple positions summary for the ticket header
  const pos = useMemo(() => {
    const p = (positions || []).find(
      (p) => String(p?.position?.coin ?? '').toUpperCase() === symbol.toUpperCase(),
    );
    if (!p) return null;
    const szi = Number(p.position?.szi ?? 0);
    return { szi };
  }, [positions, symbol]);

  return (
    <div className={styles.swapContainer}>
      <div className={styles.swapCard}>
        {/* Settings (gear) */}
        <div className={styles.swapSettingsIcon} onClick={() => setShowSettings(true)} title="Settings">
          <img src="/assets/images/gear-8.svg" alt="Settings" className={styles.gearIcon} />
        </div>

        {/* Market selector + Mark */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <MarketSelector value={symbol} options={markets} onChange={setSymbol} />
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Mark: {quoting ? '…' : (mark ? `${pretty(mark, 2)} USDC` : '—')}
          </div>
        </div>

        {/* Side selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button
            className={styles.arrowButton}
            style={{
              padding: '8px 10px',
              background: side === 'long' ? 'rgba(53,196,106,0.15)' : 'rgba(255,255,255,0.06)',
              color: side === 'long' ? '#35c46a' : '#fff',
              borderRadius: 8,
            }}
            onClick={() => setSide('long')}
          >
            Long
          </button>
          <button
            className={styles.arrowButton}
            style={{
              padding: '8px 10px',
              background: side === 'short' ? 'rgba(255,86,86,0.12)' : 'rgba(255,255,255,0.06)',
              color: side === 'short' ? '#ff5656' : '#fff',
              borderRadius: 8,
            }}
            onClick={() => setSide('short')}
          >
            Short
          </button>
        </div>

        {/* Size input (base coin) */}
        <div className={styles.swapRow}>
          <div className={styles.swapLabel}>{sideLabel}</div>
          <div className={styles.swapInputWrap}>
            <input
              className={styles.swapInput}
              placeholder="0.0"
              inputMode="decimal"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
            <div className={styles.tokenBadge}>{symbol}</div>
          </div>
          <div className={styles.balanceLine} style={{ marginTop: 6 }}>
            <span style={{ opacity: 0.8, fontSize: 12 }}>
              Notional ≈ {pretty(notional, 2)} USDC
              &nbsp;•&nbsp; Collateral need ≈ {pretty(requiredCollateral, 2)} USDC
            </span>
          </div>
        </div>

        {/* Leverage selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Leverage</div>
          {[1, 2, 3, 5, 10].map((x) => (
            <button
              key={x}
              className={styles.arrowButton}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: leverage === x ? 'rgba(53,196,106,0.15)' : 'rgba(255,255,255,0.06)',
                color: leverage === x ? '#35c46a' : '#fff',
              }}
              onClick={() => setLeverage(x)}
            >
              {x}×
            </button>
          ))}
        </div>

        {/* Collateral / balances hint */}
        <div className={styles.balanceLine} style={{ marginBottom: 8 }}>
          <span style={{ opacity: 0.8, fontSize: 12 }}>
            Withdrawable: {pretty(withdrawable, 2)} USDC
            {pos && (
              <>
                &nbsp;•&nbsp; Position: {pos.szi > 0 ? '+' : ''}{pretty(pos.szi, 6)} {symbol}
              </>
            )}
          </span>
        </div>

        {/* Notices */}
        {!!notice && (
          <div
            className={`${styles.notice} ${
              /timeout|failed|reject|unavail|error/i.test(notice) ? styles.error : styles.success
            }`}
          >
            {notice}
          </div>
        )}
        {!!quoteErr && <div className={`${styles.notice} ${styles.error}`}>{quoteErr}</div>}

        {/* Submit */}
        <button
          className={styles.swapButton}
          onClick={doSubmit}
          disabled={!canSubmit}
          title={!canSubmit ? 'Enter amount' : 'Open position'}
        >
          {buttonLabel}
        </button>
      </div>

      {/* Settings modal */}
      <SwapSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        slippage={slippagePct}
        setSlippage={setSlippagePct}
        speed={'turbo' as any}
        setSpeed={() => {}}
      />
    </div>
  );
}
