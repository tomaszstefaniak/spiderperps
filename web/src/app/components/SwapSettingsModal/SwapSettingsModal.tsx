'use client';
import React, { useState, useEffect } from 'react';
import styles from './SwapSettingsModal.module.css';

export type SpeedOption = 'fast' | 'turbo' | 'ultra';

const PRESETS = [0.5, 1, 3];

type Props = {
  visible: boolean;
  onClose(): void;
  slippage: number;
  setSlippage(v: number): void;
  speed: SpeedOption;
  setSpeed(v: SpeedOption): void;
};

const SwapSettingsModal: React.FC<Props> = ({
  visible,
  onClose,
  slippage,
  setSlippage,
  speed,
  setSpeed,
}) => {
  const [tmpSlip, setTmpSlip] = useState(slippage.toString());

  const handleInput = (raw: string) => {
    if (!/^(\d+(\.\d*)?|\.\d*)?$/.test(raw)) return;
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) {
      if (n < 0.1 || n > 99) return;
    }
    setTmpSlip(raw);
  };

  useEffect(() => setTmpSlip(slippage.toString()), [slippage]);

  if (!visible) return null;

  /* helpers */
  const numSlip = parseFloat(tmpSlip) || 0;
  const presetActive = (p: number) => Math.abs(numSlip - p) < 1e-9;

  const applyAndClose = () => {
    setSlippage(Number.isFinite(numSlip) && numSlip > 0 ? numSlip : 0.5);
    onClose();
  };

  return (
    <div className={styles.swapSettingsOverlay}>
      <div className={styles.swapSettingsModal}>
        <h3 className={styles.title}>Swap Settings</h3>

        {/* ───── Slippage ───── */}
        <div className={styles.slippageSection}>
          <div className={styles.slippageHeader}>
            <span>Slippage</span>
            <span>Custom</span>
          </div>
          <div className={styles.slippageOptions}>
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`${styles.slippageBtn} ${
                  presetActive(p) ? styles.active : ''
                }`}
                onClick={() => setTmpSlip(p.toString())}
              >
                {p}%
              </button>
            ))}

            {/* custom input */}
            <div className={styles.customWrapper}>
              <input
                type="text"
                inputMode="decimal"
                className={`
                  ${styles.slippageInput} 
                  ${PRESETS.some(presetActive) ? '' : styles.active}
                `}
                value={tmpSlip}
                onChange={(e) => handleInput(e.target.value)}
              />
            </div>
            <span className={styles.percentLabel}>%</span>
          </div>

          <p className={styles.hintText}>
            This is the maximum slippage you’re willing to accept.
          </p>
        </div>

        {/* ───── Speed ───── */}
        <div className={styles.speedSection}>
          <p className={styles.sectionTitle}>Speed</p>
          <div className={styles.speedOptions}>
            {( ['fast', 'turbo', 'ultra'] as SpeedOption[] ).map((opt) => (
              <button
                key={opt}
                className={`${styles.speedBtn} ${
                  speed === opt ? styles.active : ''
                }`}
                onClick={() => setSpeed(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
          <p className={styles.hintText}>
            Higher speeds increase priority fees, making transactions confirm faster.
          </p>
        </div>

        {/* ───── Footer ───── */}
        <div className={styles.modalButtons}>
          <button onClick={onClose} className={styles.cancelBtn}>
            Close
          </button>
          <button onClick={applyAndClose} className={styles.applyBtn}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwapSettingsModal;
