'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from './landing.module.css';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Look up any wallet's copyability report. */
export default function AddressSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const valid = ADDRESS.test(value.trim());
  return (
    <form
      className={styles.search}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/trader/${value.trim().toLowerCase()}`);
      }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Check any wallet: 0x…"
        aria-label="Wallet address"
        spellCheck={false}
        autoComplete="off"
      />
      <button type="submit" disabled={!valid}>
        Score it
      </button>
    </form>
  );
}
