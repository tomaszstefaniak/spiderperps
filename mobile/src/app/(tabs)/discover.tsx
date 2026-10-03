import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { ScoreBadge } from '@/components/score-badge';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, ErrorText, Loading, Row, Screen, Stat } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useData } from '@/hooks/use-data';
import { api } from '@/lib/api';
import { ago, hold, pct, shortAddr, usd } from '@/lib/format';

const C = Colors.dark;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export default function DiscoverScreen() {
  const ranked = useData(() => api.discover(50), 'discover');
  const [query, setQuery] = useState('');
  const status = ranked.data?.status;

  return (
    <Screen tabInset refreshing={ranked.refreshing} onRefresh={ranked.refresh}>
      <ThemedText type="subtitle">Discover</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {status?.screened
          ? `${status.screened.toLocaleString()} of ${status.accounts?.toLocaleString()} Hyperliquid accounts pass our screen; the best are scored on deposit-adjusted returns, drawdown, consistency and how easy they are to follow by hand.${status.refreshed_at ? ` Updated ${ago(status.refreshed_at)}.` : ''}`
          : 'Scoring traders…'}
      </ThemedText>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Paste any wallet address"
        placeholderTextColor={C.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => ADDRESS.test(query.trim()) && router.push(`/leader/${query.trim().toLowerCase()}`)}
        style={styles.search}
      />
      {query && !ADDRESS.test(query.trim()) ? (
        <ThemedText type="small" themeColor="textSecondary">
          An address looks like 0x followed by 40 characters.
        </ThemedText>
      ) : null}

      {ranked.error ? <ErrorText>{ranked.error}</ErrorText> : null}
      {ranked.loading ? <Loading /> : null}

      {(ranked.data?.leaders ?? []).map((l, i) => {
        const m = l.metrics;
        return (
          <Card key={l.address} onPress={() => router.push(`/leader/${l.address}`)}>
            <Row style={styles.between}>
              <Row>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  #{i + 1}
                </ThemedText>
                <ThemedText type="smallBold">{m.name || shortAddr(l.address)}</ThemedText>
              </Row>
              <ScoreBadge score={l.score} />
            </Row>
            <Row style={styles.wrap}>
              <Stat label="30d" value={pct(m.month_return, true)} tone={m.month_return >= 0 ? 'positive' : 'negative'} />
              <Stat label="Max DD" value={pct(m.month_max_dd)} tone={m.month_max_dd > 0.4 ? 'negative' : undefined} />
              <Stat label="Holds" value={hold(m.median_hold_h)} />
              <Stat label="Equity" value={usd(m.equity, { compact: true })} />
            </Row>
            <Row style={styles.wrap}>
              {/* return, drawdown and holding time are already shown as stats */}
              {m.reasons.slice(2).filter((r) => !r.startsWith('holds')).map((r) => (
                <Chip key={r} label={r} />
              ))}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  search: {
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
