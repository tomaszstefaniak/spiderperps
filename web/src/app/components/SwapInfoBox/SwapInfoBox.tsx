'use client';
import React, { useMemo, useState, useEffect } from 'react';
import styles from './SwapInfoBox.module.css';

type Side = 'long' | 'short';
type Mode = 'percent' | 'price';

export type TpSlState = {
  tpEnabled: boolean;
  tpMode: Mode;
  tpValue: number | '';     // % or price depending on mode
  slEnabled: boolean;
  slMode: Mode;
  slValue: number | '';
};

export type SwapInfoBoxProps = {
  /** Text at the left of the collapsed header (e.g., “Entry ≈ $3,945.20”) */
  rateLabel: string;
  /** Little badge on the right in the header (e.g., “TP/SL”) */
  badgeLabel?: string;

  /** Current trade context to simulate */
  entryPrice?: number | null;
  side: Side;
  size: number;             // base size (e.g., 0.45 ETH)
  leverage: number;

  /** Bubble the settings up to the parent if you want to include in an order */
  onChange?: (s: TpSlState) => void;
};

function fmtUsd(n: number | null | undefined) {
  if (!n || !isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2, 
  });
}

export default function SwapInfoBox({
  rateLabel,
  badgeLabel = 'TP/SL',
  entryPrice,
  side,
  size,
  leverage,
  onChange,
}: SwapInfoBoxProps) {
  const [expanded, setExpanded] = useState(false);

  const [state, setState] = useState<TpSlState>({
    tpEnabled: false,
    tpMode: 'percent',
    tpValue: '',
    slEnabled: false,
    slMode: 'percent',
    slValue: '',
  });

  useEffect(() => { onChange?.(state); }, [state, onChange]);

  // Derived exits + PnL
  const tpExit = useMemo(() => {
    if (!state.tpEnabled || !entryPrice || !isFinite(entryPrice)) return null;
    if (state.tpValue === '' || Number(state.tpValue) <= 0) return null;
    const v = Number(state.tpValue);
    if (state.tpMode === 'price') return v;
    // percent
    return side === 'long' ? entryPrice * (1 + v / 100) : entryPrice * (1 - v / 100);
  }, [state, entryPrice, side]);

  const slExit = useMemo(() => {
    if (!state.slEnabled || !entryPrice || !isFinite(entryPrice)) return null;
    if (state.slValue === '' || Number(state.slValue) <= 0) return null;
    const v = Number(state.slValue);
    if (state.slMode === 'price') return v;
    // percent
    return side === 'long' ? entryPrice * (1 - v / 100) : entryPrice * (1 + v / 100);
  }, [state, entryPrice, side]);

  const pnlAt = (exit: number | null) => {
    if (!entryPrice || !exit || size <= 0) return null;
    // PnL in quote (USDC) for perps with USDC as quote currency:
    const delta = (exit - entryPrice) * size * (side === 'long' ? 1 : -1);
    return delta;
  };

  const tpPnl = useMemo(() => pnlAt(tpExit), [tpExit, entryPrice, size, side]);
  const slPnl = useMemo(() => pnlAt(slExit), [slExit, entryPrice, size, side]);

  const rr =
    tpPnl !== null && slPnl !== null && slPnl !== 0
      ? Math.abs(tpPnl / slPnl)
      : null;

  const estLiq = useMemo(() => {
    if (!entryPrice || !isFinite(entryPrice) || leverage <= 0) return null;
    const f = 1 / Math.max(1, leverage);
    return side === 'long' ? entryPrice * (1 - f) : entryPrice * (1 + f);
  }, [entryPrice, leverage, side]);

  const estLiqLabel = estLiq !== null ? `${fmtUsd(estLiq)} USDC` : '—';

  function fmtPnl(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '' : '−';
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${abs} USDC`;
}

  return (
    <div className={styles.swapInfoBox}>
      <div className={styles.swapInfoHeader} onClick={() => setExpanded(x => !x)}>
        <span className={styles.swapInfoRate}>{rateLabel}</span>
        <span className={styles.swapInfoFeeBadge}>{badgeLabel}</span>
        <span
          className={expanded ? `${styles.swapInfoArrow} ${styles.swapInfoArrowOpen}` : styles.swapInfoArrow}
          aria-hidden
        >
          ▼
        </span>
      </div>

      {expanded && (
        <div className={styles.swapInfoDetails}>
          {/* Top context row */}
          <div className={styles.swapInfoRow}>
            <span>Leverage • Size • Est. Liq Price</span>
            <span>
              {leverage}× • {size > 0 ? size.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'} • {estLiqLabel}
            </span>
          </div>

          <div className={styles.rule} />

          {/* Take profit */}
          <div className={styles.rowSplit}>
            <label className={`${styles.toggle} ${state.tpEnabled ? styles.onGreen : ''}`}>
              <input
                type="checkbox"
                className={styles.switch}
                role="switch"
                aria-checked={state.tpEnabled}
                checked={state.tpEnabled}
                onChange={e => setState(s => ({ ...s, tpEnabled: e.target.checked }))}
              />
              Take Profit
            </label>

            <select
              className={styles.select}
              value={state.tpMode}
              onChange={e => setState(s => ({ ...s, tpMode: e.target.value as Mode }))}
              disabled={!state.tpEnabled}
              aria-label="TP mode"
            >
              <option value="percent">% from entry</option>
              <option value="price">Target price</option>
            </select>

            <input
              className={styles.input}
              type="number"
              step="0.01"
              placeholder={state.tpMode === 'percent' ? 'e.g. 5' : 'e.g. 4300'}
              value={state.tpValue}
              disabled={!state.tpEnabled}
              onChange={e => setState(s => ({ ...s, tpValue: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </div>

          <div className={styles.swapInfoRow}>
            <span>TP Exit • TP PnL</span>
            <span className={state.tpEnabled ? styles.good : undefined}>
              {fmtUsd(tpExit)} • {tpPnl !== null ? fmtPnl(tpPnl) : '—'}
            </span>
          </div>

          <div className={styles.rule} />

          {/* Stop loss */}
          <div className={styles.rowSplit}>
            <label className={`${styles.toggle} ${state.slEnabled ? styles.onRed : ''}`}>
              <input
                type="checkbox"
                className={styles.switch}
                role="switch"
                aria-checked={state.slEnabled}
                checked={state.slEnabled}
                onChange={e => setState(s => ({ ...s, slEnabled: e.target.checked }))}
              />
              Stop Loss
            </label>

            <select
              className={styles.select}
              value={state.slMode}
              onChange={e => setState(s => ({ ...s, slMode: e.target.value as Mode }))}
              disabled={!state.slEnabled}
              aria-label="SL mode"
            >
              <option value="percent">% from entry</option>
              <option value="price">Stop price</option>
            </select>

            <input
              className={styles.input}
              type="number"
              step="0.01"
              placeholder={state.slMode === 'percent' ? 'e.g. 2' : 'e.g. 3800'}
              value={state.slValue}
              disabled={!state.slEnabled}
              onChange={e => setState(s => ({ ...s, slValue: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </div>

          <div className={styles.swapInfoRow}>
            <span>SL Exit • SL PnL</span>
            <span className={state.slEnabled ? styles.bad : undefined}>
              {fmtUsd(slExit)} • {slPnl !== null ? fmtPnl(slPnl) : '—'}
            </span>
          </div>

          <div className={styles.rule} />

          <div className={styles.actionRow}>
            <button
              className={styles.actionBtn}
              disabled={!state.tpEnabled && !state.slEnabled}
              title={!state.tpEnabled && !state.slEnabled ? 'Enable TP or SL' : 'Apply TP/SL to order'}
              onClick={() => {/* purely UI; parent can hook into onChange state */}}
            >
              Apply to Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
