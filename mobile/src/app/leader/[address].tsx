import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { ScoreBadge } from '@/components/score-badge';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Loading, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useData } from '@/hooks/use-data';
import { api } from '@/lib/api';
import { hold, num, pct, price, shortAddr, usd } from '@/lib/format';
import { errorMessage } from '@/lib/hl';
import { useAccount, useSession } from '@/lib/session';

const C = Colors.dark;

export default function LeaderScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const addr = address.toLowerCase();
  const account = useAccount();
  const { authed } = useSession();
  const leader = useData(() => api.leader(addr), addr);
  const follows = useData(async () => (account ? (await authed((t) => api.follows(t))).follows : []), `${account?.address}:${addr}`);
  const following = follows.data?.find((f) => f.leader === addr);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFollow() {
    if (!account) return router.push('/connect');
    setBusy(true);
    setError(null);
    try {
      if (following) await authed((t) => api.unfollow(t, addr));
      else await authed((t) => api.follow(t, addr, label.trim() || undefined));
      await follows.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const d = leader.data;
  const m = d?.metrics;
  return (
    <Screen refreshing={leader.refreshing} onRefresh={leader.refresh}>
      <Stack.Screen options={{ title: following?.label || m?.name || shortAddr(addr) }} />
      {leader.error ? <ErrorText>{leader.error}</ErrorText> : null}
      {!d || !m ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row style={styles.between}>
              <ThemedText type="small" themeColor="textSecondary" selectable numberOfLines={1} adjustsFontSizeToFit>
                {addr}
              </ThemedText>
            </Row>
            <Row style={styles.between}>
              <ThemedText type="smallBold">Copyability score</ThemedText>
              <ScoreBadge score={d.score} large />
            </Row>
            <Row style={styles.wrap}>
              {m.reasons.map((r) => (
                <Chip key={r} label={r} />
              ))}
            </Row>
          </Card>

          <Card>
            <Row style={styles.wrap}>
              <Stat columns={3} label="30d return" value={pct(m.month_return, true)} tone={m.month_return >= 0 ? 'positive' : 'negative'} />
              <Stat columns={3} label="Max drawdown" value={pct(m.month_max_dd)} tone={m.month_max_dd > 0.4 ? 'negative' : undefined} />
              <Stat columns={3} label="All-time" value={pct(m.all_time_return, true)} />
              <Stat columns={3} label="Winning weeks" value={pct(m.positive_weeks)} />
              <Stat columns={3} label="Median hold" value={hold(m.median_hold_h)} />
              <Stat columns={3} label="Trades (14d)" value={String(m.round_trips_14d)} />
              <Stat columns={3} label="Equity" value={usd(m.equity, { compact: true })} />
              <Stat columns={3} label="Leverage now" value={`${m.leverage_now.toFixed(1)}×`} />
              <Stat columns={3} label="Followers here" value={String(d.followers)} />
            </Row>
            <ThemedText type="small" themeColor="textSecondary">
              Returns are time-weighted from Hyperliquid&apos;s PnL history, so deposits and withdrawals don&apos;t count as
              performance. Past results don&apos;t predict future ones.
            </ThemedText>
          </Card>

          {!following && account ? (
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Nickname (optional)"
              placeholderTextColor={C.textSecondary}
              maxLength={40}
              style={styles.input}
            />
          ) : null}
          <Button
            title={!account ? 'Connect to follow' : following ? 'Unfollow' : 'Follow'}
            kind={following ? 'danger' : 'primary'}
            onPress={toggleFollow}
            busy={busy}
          />
          {following ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              You&apos;ll get a notification for each of their moves, sized to your account.
            </ThemedText>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}

          <SectionTitle>Open positions</SectionTitle>
          {d.positions.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No open perp positions right now.
            </ThemedText>
          ) : (
            d.positions.map((p) => (
              <Card key={p.coin}>
                <Row style={styles.between}>
                  <ThemedText type="smallBold">
                    {p.coin}{' '}
                    <ThemedText type="smallBold" style={{ color: p.szi > 0 ? C.accent : C.negative }}>
                      {p.szi > 0 ? 'LONG' : 'SHORT'}
                    </ThemedText>
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {p.leverage ? `${p.leverage}×` : ''}
                  </ThemedText>
                </Row>
                <ThemedText type="small" themeColor="textSecondary">
                  {num(Math.abs(p.szi))} {p.coin} @ {price(p.entry_px)} · ~{usd(Math.abs(p.szi) * p.entry_px, { compact: true })}
                </ThemedText>
              </Card>
            ))
          )}
          {m.top_coins.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              Most traded (14d): {m.top_coins.join(', ')}
            </ThemedText>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap', rowGap: Spacing.three },
  center: { textAlign: 'center' },
  input: {
    backgroundColor: C.backgroundElement,
    color: C.text,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
});
