import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ScoreBadge } from '@/components/score-badge';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen } from '@/components/ui';
import { useData } from '@/hooks/use-data';
import { api } from '@/lib/api';
import { num, shortAddr } from '@/lib/format';
import { useAccount, useSession } from '@/lib/session';

export default function FollowingScreen() {
  const account = useAccount();
  const { authed } = useSession();
  const follows = useData(
    async () => (account ? (await authed((t) => api.follows(t))).follows : []),
    account?.address ?? 'signed-out',
  );

  if (!account) {
    return (
      <Screen tabInset>
        <ThemedText type="subtitle">Following</ThemedText>
        <Empty title="Connect your account to follow traders" body="Browsing traders works without an account.">
          <Button title="Connect Hyperliquid account" onPress={() => router.push('/connect')} />
        </Empty>
      </Screen>
    );
  }

  const list = follows.data ?? [];
  return (
    <Screen tabInset refreshing={follows.refreshing} onRefresh={follows.refresh}>
      <ThemedText type="subtitle">Following</ThemedText>
      {follows.error ? <ErrorText>{follows.error}</ErrorText> : null}
      {follows.loading ? <Loading /> : null}
      {!follows.loading && list.length === 0 ? (
        <Empty title="You're not following anyone yet" body="Pick traders on Discover - you'll get their moves as copy proposals.">
          <Button title="Discover traders" kind="secondary" onPress={() => router.navigate('/discover')} />
        </Empty>
      ) : null}
      {list.map((f) => {
        const copied = Object.entries(f.copied);
        return (
          <Card key={f.leader} onPress={() => router.push(`/leader/${f.leader}`)}>
            <Row style={styles.between}>
              <ThemedText type="smallBold">{f.label || shortAddr(f.leader)}</ThemedText>
              {f.score != null ? <ScoreBadge score={f.score} /> : null}
            </Row>
            <ThemedText type="small" themeColor="textSecondary">
              {copied.length
                ? `Copied: ${copied.map(([coin, szi]) => `${szi > 0 ? '+' : ''}${num(szi)} ${coin}`).join(' · ')}`
                : 'No copied positions open'}
            </ThemedText>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
});
