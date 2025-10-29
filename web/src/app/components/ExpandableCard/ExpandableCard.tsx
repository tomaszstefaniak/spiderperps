'use client';
import React, { useEffect, useMemo, useState } from 'react';
import styles from './ExpandableCard.module.css';

export default function ExpandableCard({
  title,
  right,
  storageKey,
  defaultOpen = false,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  storageKey: string;         // e.g. "ui.exp.positions"
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // hydrate expanded state from localStorage (sticky across reloads)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === '1') setOpen(true);
      if (raw === '0') setOpen(false);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch {}
  }, [open, storageKey]);

  const arrowCls = useMemo(
    () => (open ? `${styles.arrow} ${styles.arrowOpen}` : styles.arrow),
    [open]
  );

  return (
    <div className={styles.card}>
      <div className={styles.header} onClick={() => setOpen(v => !v)}>
        <span className={styles.title}>{title}</span>
        <div className={styles.rightWrap}>
          {right && <span className={styles.right}>{right}</span>}
          <span className={arrowCls}>▼</span>
        </div>
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}
