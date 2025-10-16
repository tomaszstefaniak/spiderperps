'use client';
import React from 'react';
import styles from './MarketSelector.module.css';

type Props = {
  value: string;
  options: string[];
  onChange: (v: string) => void;
};

export default function MarketSelector({ value, options, onChange }: Props) {
  const sym = (value || '').toUpperCase();
  const iconUrl = `https://app.hyperliquid.xyz/coins/${sym}.svg`;

  return (
    <div className={styles.container}>
      <div className={styles.label}>Market</div>
      <div className={styles.selectWrap}>
        {/* icon for the currently selected market */}
        <img
          className={styles.selectedIcon}
          src={iconUrl}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            // hide if remote icon 404s
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <select
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className={styles.chevron}>▾</span>
      </div>
    </div>
  );
}
