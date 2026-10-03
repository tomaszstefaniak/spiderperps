'use client';

import React, { useMemo, useState } from 'react';
import styles from './MarketSelector.module.css';
import MarketPicker from './MarketPicker';
import { nameForSymbol } from './symbolNames';

type Props = {
  value: string;
  options: string[];
  onChange: (v: string) => void;
};

export default function MarketSelector({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const sym = (value || '').toUpperCase();

  const iconUrl = useMemo(
    () => `https://app.hyperliquid.xyz/coins/${sym}.svg`,
    [sym]
  );

  return (
    <>
      <div className={styles.container}>

        <button
          type="button"
          className={styles.pickerButton}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Select market, current ${nameForSymbol(sym)}`}
        >
          <img
            className={styles.icon}
            src={iconUrl}
            alt=""
            aria-hidden="true"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/unknown.svg';
            }}
          />
          <span className={styles.symbol}>{nameForSymbol(sym)}</span>
          <span className={styles.caret}>▾</span>
        </button>
      </div>

      <MarketPicker
        visible={open}
        value={sym}
        options={options}
        onClose={() => setOpen(false)}
        onSelect={(s) => {
          onChange(s);
          setOpen(false);
        }}
      />
    </>
  );
}
