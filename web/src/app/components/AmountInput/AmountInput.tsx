import React, { useState, useEffect, startTransition, ChangeEvent } from 'react';
import styles from './AmountInput.module.css';

interface AmountInputProps {
  initial?: string;
  onDebouncedChange: (val: string) => void;
  disabled?: boolean;
}

export default function AmountInput({
  initial = '',
  onDebouncedChange,
  disabled = false,
}: AmountInputProps) {
  const [local, setLocal] = useState(initial);

  // keep local in sync when parent “initial” changes
  useEffect(() => {
    setLocal(initial);
  }, [initial]);

  // debounce
  useEffect(() => {
    const id = window.setTimeout(() => {
      startTransition(() => {
        onDebouncedChange(local.trim());
      });
    }, 500);
    return () => void clearTimeout(id);
  }, [local, onDebouncedChange]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9.]/g, '');
    const parts = v.split('.');
    if (parts.length > 2) {
      v = parts[0] + '.' + parts.slice(1).join('');
    }
    // avoid leading zeroes like “01” -> “0.1”
    if (v.startsWith('0') && !v.includes('.') && v.length > 1) {
      v = '0.' + v.slice(1);
    }
    setLocal(v);
  };

  return (
    <input
      type="text"
      className={styles.input}
      placeholder="0"
      value={local}
      onChange={handleChange}
      disabled={disabled}
    />
  );
}
