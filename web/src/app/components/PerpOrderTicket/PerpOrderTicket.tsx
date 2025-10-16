'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './PerpOrderTicket.module.css';
import SwapSettingsModal from '../SwapSettingsModal/SwapSettingsModal';
import { useBalances } from '@/hooks/useBalances';
import MarketSelector from '../MarketSelector/MarketSelector';

type Side = 'long' | 'short';
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const pretty = (n: number, dp = 6) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const log = (id: string, label: string, data?: any) => console.log(`[perp:${id}] ${label}`, data ?? '');

export default function PerpOrderTicket() {
  const id = useMemo(rid, []);
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

  const sizeNum = Number(size || '0');
  const slippage = clamp(slippagePct, 0, 5) / 100;

  // derived
  const notional = useMemo(() => sizeNum * mark, [sizeNum, mark]);
  const requiredCollateral = useMemo(() => (leverage > 0 ? notional / leverage : 0), [notional, leverage]);

  const canSubmit = useMemo(
    () => isFinite(sizeNum) && sizeNum > 0 && mark > 0 && !busy,
    [sizeNum, mark, busy]
  );

  const sideLabel = side === 'long' ? 'Buy / Long' : 'Sell / Short';
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
        size: Number(size || '0'),
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
      if (filled) setNotice('Swap filled!');
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
  }, [symbol, side, size, slippage, refresh]);

  // simple positions summary
  const pos = useMemo(() => {
    const p = (positions || []).find(
      (pp) => String(pp?.position?.coin ?? '').toUpperCase() === symbol.toUpperCase(),
    );
    if (!p) return null;
    const szi = Number(p.position?.szi ?? 0);
    return { szi };
  }, [positions, symbol]);

  // treat notices that mention liquidity / cap as error
  const isErrorNotice =
    !!blockMsg || /timeout|failed|reject|unavail|error|liquidity|interest|cap|http/i.test(String(notice || ''));

  return (
    <div className={styles.swapContainer}>
      <div className={styles.swapCard}>
        {/* Settings */}
        <div className={styles.swapSettingsIcon} onClick={() => setShowSettings(true)} title="Settings">
          <img src="/assets/images/gear-8.svg" alt="Settings" className={styles.gearIcon} />
        </div>

        {/* Header */}
        <div className={styles.headerRow}>
          <MarketSelector value={symbol} options={markets} onChange={setSymbol} />
          <div className={styles.markText}>
            Mark: {quoting ? '…' : (mark ? `${pretty(mark, 2)} USDC` : '—')}
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
          <div className={styles.balanceLine}>
            Notional ≈ {pretty(notional, 2)} USDC
            <span className={styles.dot}>•</span>
            Collateral need ≈ {pretty(requiredCollateral, 2)} USDC
          </div>
        </div>

        {/* Leverage */}
        <div className={styles.leverageGroup}>
          <div className={styles.leverageLabel}>Leverage</div>
          {[1, 2, 3, 5, 10].map((x) => (
            <button
              key={x}
              className={`${styles.leverageButton} ${leverage === x ? styles.leverageActive : ''}`}
              onClick={() => setLeverage(x)}
            >
              {x}×
            </button>
          ))}
        </div>

        {/* Balances */}
        <div className={styles.balanceLine}>
          Withdrawable: {pretty(withdrawable, 2)} USDC
          {pos && (
            <>
              <span className={styles.dot}>•</span>
              Position: {pos.szi > 0 ? '+' : ''}{pretty(pos.szi, 6)} {symbol}
            </>
          )}
        </div>

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
