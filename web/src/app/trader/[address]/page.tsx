import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { ADDRESS, getLeader } from '@/lib/copytrade';
import { hold, pct, shortAddr, usd } from '@/lib/format';

import styles from '../../landing.module.css';
import own from './trader.module.css';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return { title: `${shortAddr(address)} · SpiderPerps` };
}

export default async function TraderPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!ADDRESS.test(address)) notFound();
  await connection();

  let d: Awaited<ReturnType<typeof getLeader>> | null = null;
  try {
    d = await getLeader(address.toLowerCase());
  } catch {
    d = null;
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand} style={{ color: 'inherit', textDecoration: 'none' }}>
          SpiderPerps
        </Link>
        <div className={styles.navLinks}>
          <Link href="/#rankings">Rankings</Link>
        </div>
      </nav>

      <section className={styles.section} style={{ marginTop: 16 }}>
        <p className={`${styles.muted} ${own.address}`}>{address.toLowerCase()}</p>
        {!d ? (
          <p className={styles.muted}>Couldn&apos;t load this wallet right now. Try again in a minute.</p>
        ) : (
          <>
            <div className={own.scoreRow}>
              <h2 style={{ margin: 0 }}>Copyability score</h2>
              <span className={d.score >= 50 ? styles.scoreHigh : d.score >= 30 ? styles.scoreMid : styles.scoreLow} style={{ fontSize: 24 }}>
                {Math.round(d.score)}
              </span>
            </div>
            <div className={own.chips}>
              {d.metrics.reasons.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>

            <div className={own.stats}>
              <Stat label="30d return" value={pct(d.metrics.month_return, true)} tone={d.metrics.month_return >= 0 ? 'pos' : 'neg'} />
              <Stat label="Max drawdown" value={pct(d.metrics.month_max_dd)} tone={d.metrics.month_max_dd > 0.4 ? 'neg' : undefined} />
              <Stat label="All-time" value={pct(d.metrics.all_time_return, true)} />
              <Stat label="Winning weeks" value={pct(d.metrics.positive_weeks)} />
              <Stat label="Median hold" value={hold(d.metrics.median_hold_h)} />
              <Stat label="Trades (14d)" value={String(d.metrics.round_trips_14d)} />
              <Stat label="Equity" value={usd(d.metrics.equity)} />
              <Stat label="Leverage now" value={`${d.metrics.leverage_now.toFixed(1)}×`} />
              <Stat label="Followers here" value={String(d.followers)} />
            </div>

            <h2 style={{ marginTop: 40 }}>Open positions</h2>
            {d.positions.length === 0 ? (
              <p className={styles.muted}>No open perp positions right now.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Side</th>
                      <th>Size</th>
                      <th>Entry</th>
                      <th>Value</th>
                      <th>Leverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.positions.map((p) => (
                      <tr key={p.coin}>
                        <td>{p.coin}</td>
                        <td className={p.szi > 0 ? styles.pos : styles.neg}>{p.szi > 0 ? 'LONG' : 'SHORT'}</td>
                        <td>{Math.abs(p.szi).toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                        <td>{p.entry_px.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                        <td>{usd(Math.abs(p.szi) * p.entry_px)}</td>
                        <td>{p.leverage ? `${p.leverage}×` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={styles.footnote}>
              Follow this trader in the SpiderPerps app to get each of their moves as a copy you can approve. Past results don&apos;t
              predict future ones. Not investment advice.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className={own.stat}>
      <span className={styles.muted}>{label}</span>
      <strong className={tone === 'pos' ? styles.pos : tone === 'neg' ? styles.neg : undefined}>{value}</strong>
    </div>
  );
}
