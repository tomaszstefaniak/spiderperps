import Link from 'next/link';
import { connection } from 'next/server';

import { getRanking, type RankedLeader } from '@/lib/copytrade';
import { ago, hold, pct, shortAddr, usd } from '@/lib/format';

import AddressSearch from './AddressSearch';
import styles from './landing.module.css';

const STEPS = [
  {
    title: 'Pick traders worth copying',
    body: "We screen Hyperliquid's ~47k accounts and score the best on deposit-adjusted returns, drawdown, consistency and how easy they are to follow by hand.",
  },
  {
    title: 'Get their moves on your phone',
    body: 'When someone you follow opens, adds to, cuts or closes a position, you get a notification with a copy sized to your account.',
  },
  {
    title: 'Approve, and your phone signs',
    body: 'Face ID, then your phone signs the order and sends it straight to Hyperliquid, with your own stop-loss attached.',
  },
];

export default async function Home() {
  await connection(); // live rankings: render per request, never at build time
  let ranking: Awaited<ReturnType<typeof getRanking>> | null = null;
  try {
    ranking = await getRanking(25);
  } catch {
    ranking = null;
  }
  const status = ranking?.status;

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <span className={styles.brand}>SpiderPerps</span>
        <div className={styles.navLinks}>
          <a href="#rankings">Rankings</a>
          <Link href="/trade">Trade</Link>
        </div>
      </nav>

      <section className={styles.hero}>
        <h1>
          Copy the best Hyperliquid traders.
          <br />
          <span className={styles.accent}>Approve every trade. Keep your keys.</span>
        </h1>
        <p className={styles.lead}>
          SpiderPerps watches top traders and sends their moves to your phone as one-tap copies, sized to your account and
          protected by your own stop-loss. Your phone signs every order; our server never holds a key.
        </p>
        <div className={styles.badges}>
          <span>iPhone app: TestFlight beta</span>
          <span>Non-custodial</span>
          <span>Testnet paper-copying</span>
        </div>
      </section>

      <section className={styles.steps}>
        {STEPS.map((s, i) => (
          <div key={s.title} className={styles.card}>
            <div className={styles.stepNo}>{i + 1}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <section id="rankings" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Trader rankings</h2>
          <p className={styles.muted}>
            {status?.screened
              ? `${status.screened.toLocaleString()} of ${status.accounts?.toLocaleString()} accounts pass the screen · updated ${ago(status.refreshed_at)}`
              : 'Scoring traders…'}
          </p>
        </div>
        <AddressSearch />
        {ranking ? <Ranking leaders={ranking.leaders} /> : <p className={styles.muted}>Rankings are temporarily unavailable.</p>}
        <p className={styles.footnote}>
          Returns are time-weighted from Hyperliquid&apos;s PnL history, so deposits and withdrawals don&apos;t count as
          performance. Past results don&apos;t predict future ones. Not investment advice.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Your keys stay yours</h2>
        <div className={styles.steps}>
          <div className={styles.card}>
            <h3>Trading-only key</h3>
            <p>Your phone creates a Hyperliquid agent key and keeps it in the iOS Keychain. You approve it once from your wallet.</p>
          </div>
          <div className={styles.card}>
            <h3>Can&apos;t withdraw</h3>
            <p>Agent keys can place and cancel orders but can never withdraw or transfer funds. Revoke them on Hyperliquid any time.</p>
          </div>
          <div className={styles.card}>
            <h3>No keys on our server</h3>
            <p>The server only watches public data and proposes copies. Orders go from your phone straight to Hyperliquid.</p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        Built for the Colosseum Crypto World&apos;s Fair · Hyperliquid track
      </footer>
    </main>
  );
}

function Ranking({ leaders }: { leaders: RankedLeader[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Trader</th>
            <th>Score</th>
            <th>30d</th>
            <th>Max DD</th>
            <th className={styles.hideSm}>Holds</th>
            <th className={styles.hideSm}>Equity</th>
            <th className={styles.hideSm}>Why</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((l, i) => {
            const m = l.metrics;
            return (
              <tr key={l.address}>
                <td className={styles.muted}>{i + 1}</td>
                <td>
                  <Link href={`/trader/${l.address}`} className={styles.addr}>
                    {m.name || shortAddr(l.address)}
                  </Link>
                </td>
                <td>
                  <span className={l.score >= 50 ? styles.scoreHigh : l.score >= 30 ? styles.scoreMid : styles.scoreLow}>
                    {Math.round(l.score)}
                  </span>
                </td>
                <td className={m.month_return >= 0 ? styles.pos : styles.neg}>{pct(m.month_return, true)}</td>
                <td className={m.month_max_dd > 0.4 ? styles.neg : undefined}>{pct(m.month_max_dd)}</td>
                <td className={styles.hideSm}>{hold(m.median_hold_h)}</td>
                <td className={styles.hideSm}>{usd(m.equity)}</td>
                <td className={`${styles.hideSm} ${styles.muted}`}>{m.reasons.slice(3).join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
