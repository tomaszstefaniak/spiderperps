import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius } from '@/constants/theme';

const C = Colors.dark;

export function scoreColor(score: number): string {
  return score >= 50 ? C.accent : score >= 30 ? C.warning : C.textSecondary;
}

export function ScoreBadge({ score, large }: { score: number; large?: boolean }) {
  const color = scoreColor(score);
  return (
    <View style={[styles.badge, large && styles.large, { borderColor: color }]}>
      <ThemedText style={[styles.text, large && styles.largeText, { color }]}>{Math.round(score)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1.5, borderRadius: Radius.pill, minWidth: 40, paddingHorizontal: 8, paddingVertical: 2, alignItems: 'center' },
  large: { minWidth: 64, paddingVertical: 6 },
  text: { fontWeight: 700, fontSize: 15 },
  largeText: { fontSize: 24, lineHeight: 30 },
});
