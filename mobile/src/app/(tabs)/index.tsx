import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ProposalCard } from '@/components/proposal-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Empty, ErrorText, Loading, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useData, useNow } from '@/hooks/use-data';
import { api } from '@/lib/api';
import { shortAddr, usd } from '@/lib/format';
import { accountSummary } from '@/lib/hl';
import { useAccount, useSession } from '@/lib/session';

export default function InboxScreen() {
  const account = useAccount();
  if (!account) return <Welcome />;
  return <Inbox />;
}

function Welcome() {
  return (
    <Screen tabInset>
      <ThemedText type="subtitle" style={styles.title}>
        Copy the best Hyperliquid traders.{'\n'}Approve every trade.
      </ThemedText>
      <Card>
        <ThemedText type="smallBold">How it works</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          1. Pick traders ranked by deposit-adjusted returns, drawdown and how easy they are to follow.{'\n'}
          2. When they open, add to, cut or close a position, you get a notification with a copy sized to your account.{'\n'}
          3. You approve or reject. Your phone signs the order and sends it straight to Hyperliquid, with your own stop-loss attached.
        </ThemedText>
      </Card>
      <Card>
        <ThemedText type="smallBold">Your keys stay yours</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          You approve a trading-only key for this phone once. It stays in this phone&apos;s secure storage, can place orders but can
          never withdraw or transfer your funds, and you can revoke it on Hyperliquid at any time. Our server never sees a key.
        </ThemedText>
      </Card>
      <Button title="Connect Hyperliquid account" onPress={() => router.push('/connect')} />
      <Button title="Browse traders first" kind="secondary" onPress={() => router.navigate('/discover')} />
    </Screen>
  );
}

function Inbox() {
  const account = useAccount()!;
  const { authed } = useSession();
  const proposals = useData(() => authed((t) => api.proposals(t, 'all')), account.address, 10_000);
  const summary = useData(() => accountSummary(account.network, account.address), `${account.network}:${account.address}`, 30_000);

  const clock = useNow(5000);
  const list = proposals.data?.proposals ?? [];
  const now = Math.max(clock, proposals.data?.server_time ?? 0);
  const pending = list.filter((p) => p.status === 'pending' && p.expires_at > now);
  const recent = list.filter((p) => !pending.includes(p)).slice(0, 30);

  return (
    <Screen tabInset refreshing={proposals.refreshing} onRefresh={() => (proposals.refresh(), summary.refresh())}>
      <Row style={styles.between}>
        <ThemedText type="subtitle">Inbox</ThemedText>
        <Chip label={account.network} tone={account.network === 'testnet' ? 'warning' : 'positive'} />
      </Row>
      <Card>
        <Row style={styles.between}>
          <ThemedText type="small" themeColor="textSecondary">
            {shortAddr(account.address)}
          </ThemedText>
          {account.network === 'testnet' ? (
            <ThemedText type="small" themeColor="textSecondary">
              paper-copying real traders
            </ThemedText>
          ) : null}
        </Row>
        <Row style={styles.wrap}>
          <Stat label="Equity" value={usd(summary.data?.equity)} />
          <Stat label="Available" value={usd(summary.data?.withdrawable)} />
          <Stat label="Positions" value={summary.data ? String(summary.data.positions.length) : '—'} />
        </Row>
      </Card>

      {proposals.error ? <ErrorText>{proposals.error}</ErrorText> : null}
      {proposals.loading ? <Loading /> : null}

      <SectionTitle>Waiting for you</SectionTitle>
      {!proposals.loading && pending.length === 0 ? (
        <Empty title="Nothing to approve" body="When a trader you follow moves, the copy shows up here and on your lock screen.">
          <Button title="Find traders to follow" kind="secondary" onPress={() => router.navigate('/discover')} />
        </Empty>
      ) : null}
      {pending.map((p) => (
        <ProposalCard key={p.id} p={p} now={now} />
      ))}

      {recent.length > 0 ? <SectionTitle>Recent</SectionTitle> : null}
      {recent.map((p) => (
        <ProposalCard key={p.id} p={p} now={now} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 36, marginTop: Spacing.three },
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
});
