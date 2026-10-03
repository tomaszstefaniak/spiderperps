import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Row } from '@/components/ui';
import { Colors } from '@/constants/theme';
import type { Proposal } from '@/lib/api';
import { ago, moveText, num, shortAddr, usd } from '@/lib/format';

const C = Colors.dark;

export const STATUS_TONE: Record<Proposal['status'], 'neutral' | 'positive' | 'negative' | 'warning' | 'info'> = {
  pending: 'warning',
  info: 'info',
  approved: 'positive',
  rejected: 'neutral',
  expired: 'neutral',
  superseded: 'neutral',
  failed: 'negative',
};

export function orderText(p: Proposal): string {
  if (p.size <= 0) return 'Alert only';
  return `${p.is_buy ? 'BUY' : 'SELL'} ${num(p.size)} ${p.coin}${p.reduce_only ? ' (reduce only)' : ''}`;
}

export function ProposalCard({ p, now }: { p: Proposal; now: number }) {
  const secondsLeft = p.expires_at - now;
  const pending = p.status === 'pending' && secondsLeft > 0;
  return (
    <Card onPress={() => router.push(`/proposal/${p.id}`)} style={pending && styles.pending}>
      <Row style={styles.between}>
        <ThemedText type="small" themeColor="textSecondary">
          {shortAddr(p.leader)} · {ago(p.created_at, now)}
        </ThemedText>
        {pending ? (
          <Chip label={`${Math.max(0, Math.floor(secondsLeft / 60))}m left`} tone="warning" />
        ) : (
          <Chip label={p.status} tone={STATUS_TONE[p.status]} />
        )}
      </Row>
      <ThemedText type="default">{moveText(p)}</ThemedText>
      <View style={styles.order}>
        <ThemedText type="smallBold" style={{ color: p.size > 0 ? (p.is_buy ? C.accent : C.negative) : C.textSecondary }}>
          {orderText(p)}
        </ThemedText>
        {p.size > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            ~{usd(p.notional)}
            {p.leverage ? ` · ${p.leverage}×` : ''}
            {p.sl_pct ? ` · SL ${p.sl_pct}%` : ''}
          </ThemedText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pending: { borderColor: C.warning },
  between: { justifyContent: 'space-between' },
  order: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
});
