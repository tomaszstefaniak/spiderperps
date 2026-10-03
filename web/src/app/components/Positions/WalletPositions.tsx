'use client';

import React from 'react';
import useSWR from 'swr';
import styles from '../Positions/PositionsTable.module.css'; // Reuse styles
import { useLiveMids } from '@/app/components/_shared/LiveMidsContext';
import { loadAccount } from '@/lib/hl-browser';

const pretty = (n: number, dp = 4) =>
    (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: dp });
const signed = (n: number, dp = 2) =>
    `${n > 0 ? '+' : ''}${pretty(n, dp)}`;
const num = (x: any, d = 0) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : d;
};

interface Props {
    address: string;
    onCopy: (pos: any) => void;
}

export default function WalletPositions({ address, onCopy }: Props) {
    const { data: walletData, error, isLoading } = useSWR(address ? ['positions', address] : null, () => loadAccount(address as `0x${string}`), { refreshInterval: 5000 });
    const mids = useLiveMids();

    if (!address) return <div className={styles.empty}>Select a wallet to see positions.</div>;
    if (isLoading) return <div className={styles.empty}>Loading positions...</div>;
    if (error || !walletData || !walletData.positions) return <div className={styles.empty}>No positions found or error.</div>;

    const positions = walletData.positions;

    if (positions.length === 0) {
        return <div className={styles.empty}>No open positions for {address.slice(0, 6)}...{address.slice(-4)}.</div>;
    }

    return (
        <div className={styles.table}>
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', color: '#aaa', borderBottom: '1px solid #333' }}>
                Start copying <strong>{address.slice(0, 6)}...{address.slice(-4)}</strong>
            </div>
            {/* Headers */}
            <div className={styles.headerRow}>
                <div>Market</div>
                <div className={styles.right}>Side</div>
                <div className={styles.right}>Size</div>
                <div className={`${styles.right} ${styles.hideSm}`}>Entry</div>
                <div className={styles.right}>Fair</div>
                <div className={styles.right}>Est. PnL</div>
                <div className={styles.right}>Copy</div>
            </div>

            <div className={styles.rows}>
                {positions.map((p: any) => {
                    const coin = String(p.coin).toUpperCase();
                    const szi = num(p.szi);
                    const entry = num(p.entryPx);

                    const fair = (mids[coin]) ?? 0;

                    // uPnL approx
                    const upnlCalc = fair > 0 && entry > 0 ? (fair - entry) * szi : 0;

                    const sideLabel = szi > 0 ? 'Long' : szi < 0 ? 'Short' : '—';
                    const sideClass = szi > 0 ? styles.green : szi < 0 ? styles.red : '';
                    const iconUrl = `https://app.hyperliquid.xyz/coins/${coin}.svg`;

                    return (
                        <div key={coin} className={styles.row}>
                            <div className={styles.marketCell}>
                                <img
                                    className={styles.coinIcon}
                                    src={iconUrl}
                                    alt=""
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                                <span>{coin}</span>
                            </div>

                            <div className={`${styles.num} ${sideClass}`}>{sideLabel}</div>
                            <div className={`${styles.num} ${sideClass}`}>{pretty(szi, 4)}</div>

                            <div className={`${styles.num} ${styles.hideSm}`}>{entry ? pretty(entry, 2) : '—'}</div>
                            <div className={styles.num}>{fair ? pretty(fair, 2) : '—'}</div>

                            <div className={`${styles.num} ${upnlCalc >= 0 ? styles.green : styles.red}`}>
                                {pretty(upnlCalc, 2)}
                            </div>

                            <div className={styles.actCell}>
                                <button
                                    className={styles.smallPill}
                                    onClick={() => onCopy({ coin, side: szi > 0 ? 'long' : 'short', size: Math.abs(szi), entry })}
                                    title="Copy this position"
                                    style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
