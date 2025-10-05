// src/app/components/MarketSelector/MarketSelector.tsx
'use client';

import React from 'react';

type Props = {
  value: string;
  options: string[];
  onChange: (v: string) => void;
};

export default function MarketSelector({ value, options, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Market</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'rgba(255,255,255,0.06)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '6px 10px',
          outline: 'none',
        }}
      >
        {options.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
