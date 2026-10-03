import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

const C = Colors.dark;

export function Screen({
  children,
  refreshing,
  onRefresh,
  tabInset = false,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  tabInset?: boolean;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, tabInset && { paddingBottom: BottomTabInset + Spacing.five }]}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.textSecondary} /> : undefined
      }>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionText}>
        {children}
      </ThemedText>
      {right}
    </Row>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.accent, secondary: C.backgroundSelected, danger: '#3A1518', ghost: 'transparent' }[kind];
  const fg = { primary: C.accentText, secondary: C.text, danger: C.negative, ghost: C.textSecondary }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        kind === 'ghost' && styles.ghost,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {busy ? <ActivityIndicator color={fg} /> : <ThemedText style={[styles.buttonText, { color: fg }]}>{title}</ThemedText>}
    </Pressable>
  );
}

export function Chip({
  label,
  tone = 'neutral',
  selected,
  onPress,
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'info';
  selected?: boolean;
  onPress?: () => void;
}) {
  const color = { neutral: C.textSecondary, positive: C.accent, negative: C.negative, warning: C.warning, info: C.info }[tone];
  const body = (
    <View style={[styles.chip, { borderColor: selected ? C.accent : C.border }, selected && { backgroundColor: '#12291F' }]}>
      <ThemedText type="small" style={{ color: selected ? C.accent : color }}>
        {label}
      </ThemedText>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={6}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Stat({
  label,
  value,
  tone,
  columns = 4,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
  /** How many stats share a row. */
  columns?: 3 | 4;
}) {
  const color = tone === 'positive' ? C.accent : tone === 'negative' ? C.negative : C.text;
  return (
    <View style={[styles.stat, { flexBasis: columns === 3 ? '30%' : '22%' }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.statValue, { color }]}>
        {value}
      </ThemedText>
    </View>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {body}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" style={{ color: C.negative }}>
      {children}
    </ThemedText>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={C.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  section: { justifyContent: 'space-between', marginTop: Spacing.two },
  sectionText: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 },
  button: { borderRadius: Radius.medium, paddingVertical: 14, paddingHorizontal: Spacing.three, alignItems: 'center' },
  ghost: { paddingVertical: 8 },
  buttonText: { fontWeight: 700, fontSize: 16 },
  disabled: { opacity: 0.45 },
  chip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  stat: { flexGrow: 1, gap: 2 },
  statValue: { fontSize: 16 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  center: { textAlign: 'center' },
});
