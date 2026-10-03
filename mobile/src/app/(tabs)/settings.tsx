import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Empty, ErrorText, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, type Settings } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { shortAddr } from '@/lib/format';
import { errorMessage } from '@/lib/hl';
import { loadPrefs, savePrefs, type LocalPrefs } from '@/lib/prefs';
import { registerForPush } from '@/lib/push';
import { useAccount, useSession } from '@/lib/session';

const C = Colors.dark;

type Field = { key: 'multiplier' | 'max_usd' | 'max_leverage' | 'sl_pct' | 'tp_pct'; label: string; hint: string; suffix?: string };
const FIELDS: Field[] = [
  { key: 'multiplier', label: 'Size multiplier', hint: '1 = same % of your account as the trader uses of theirs', suffix: '×' },
  { key: 'max_usd', label: 'Max per trade', hint: 'Caps the value of any single copy', suffix: 'USD' },
  { key: 'max_leverage', label: 'Max leverage', hint: "Copies use the trader's leverage up to this", suffix: '×' },
  { key: 'sl_pct', label: 'Stop-loss', hint: 'Price move against you that closes a copy. 0 = off', suffix: '%' },
  { key: 'tp_pct', label: 'Take-profit', hint: 'Price move in your favor that closes a copy. 0 = off', suffix: '%' },
];

export default function SettingsScreen() {
  const account = useAccount();
  const { authed, signOut } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState<LocalPrefs | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applySettings(s: Settings) {
    setSettings(s);
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, s[f.key] == null ? '0' : String(s[f.key])])));
  }

  useEffect(() => {
    loadPrefs().then(setPrefs);
    if (!account) return;
    authed((t) => api.me(t))
      .then((me) => {
        applySettings(me.settings);
        setPushStatus(me.devices > 0 ? 'On for this account' : 'Off');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [account, authed]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const patch = Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key] || 0)]));
      applySettings(await authed((t) => api.updateSettings(t, patch)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function enablePush() {
    const r = await registerForPush(authed).catch((e) => ({ ok: false as const, reason: errorMessage(e) }));
    setPushStatus(r.ok ? 'On for this account' : r.reason);
  }

  function disconnect(forgetKey: boolean) {
    Alert.alert(
      forgetKey ? 'Remove trading key?' : 'Sign out?',
      forgetKey
        ? "The key is deleted from this phone. Also revoke it on Hyperliquid (API wallets) so it can't be used again."
        : 'Your trading key stays on this phone so you can sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: forgetKey ? 'Remove' : 'Sign out', style: 'destructive', onPress: () => signOut({ forgetKey }) },
      ],
    );
  }

  return (
    <Screen tabInset>
      <ThemedText type="subtitle">Settings</ThemedText>
      {!account ? (
        <Empty title="Not connected" body="Connect your Hyperliquid account to follow traders and approve copies.">
          <Button title="Connect Hyperliquid account" onPress={() => router.push('/connect')} />
        </Empty>
      ) : (
        <>
          <Card>
            <Row style={styles.between}>
              <ThemedText type="smallBold">{shortAddr(account.address)}</ThemedText>
              <Chip label={account.network} tone={account.network === 'testnet' ? 'warning' : 'positive'} />
            </Row>
            <ThemedText type="small" themeColor="textSecondary">
              Trading key on this phone: {shortAddr(account.agent.address)}. It can place orders but can&apos;t withdraw or
              transfer funds.
            </ThemedText>
          </Card>

          <SectionTitle>Copy sizing & protection</SectionTitle>
          <Card>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.field}>
                <Row style={styles.between}>
                  <ThemedText type="small">{f.label}</ThemedText>
                  <Row>
                    <TextInput
                      value={draft[f.key] ?? ''}
                      onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      accessibilityLabel={f.label}
                    />
                    <ThemedText type="small" themeColor="textSecondary" style={styles.suffix}>
                      {f.suffix}
                    </ThemedText>
                  </Row>
                </Row>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  {f.hint}
                </ThemedText>
              </View>
            ))}
            <Button title="Save" onPress={save} busy={saving} disabled={!settings} />
          </Card>

          <SectionTitle>Notifications</SectionTitle>
          <Card>
            <Row style={styles.between}>
              <ThemedText type="small">Push on this phone</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
                {pushStatus ?? '…'}
              </ThemedText>
            </Row>
            <Button title="Enable notifications" kind="secondary" onPress={enablePush} />
            <Row style={styles.between}>
              <View style={styles.flex}>
                <ThemedText type="small">Also notify moves I can&apos;t copy</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  e.g. a trader closing a position you never copied
                </ThemedText>
              </View>
              <Switch
                value={!!settings?.notify_info}
                onValueChange={async (v) => applySettings(await authed((t) => api.updateSettings(t, { notify_info: v })))}
              />
            </Row>
          </Card>

          <SectionTitle>Security</SectionTitle>
          <Card>
            <Row style={styles.between}>
              <View style={styles.flex}>
                <ThemedText type="small">Face ID to approve</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  Ask before signing every order
                </ThemedText>
              </View>
              <Switch
                value={!!prefs?.requireBiometrics}
                onValueChange={async (v) => setPrefs(await savePrefs({ requireBiometrics: v }))}
              />
            </Row>
          </Card>

          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button title="Sign out" kind="secondary" onPress={() => disconnect(false)} />
          <Button title="Remove trading key from this phone" kind="danger" onPress={() => disconnect(true)} />
        </>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Server: {API_URL}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  field: { gap: 2, marginBottom: Spacing.two },
  input: {
    minWidth: 80,
    textAlign: 'right',
    color: C.text,
    fontSize: 16,
    backgroundColor: C.background,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  suffix: { minWidth: 28 },
  hint: { fontSize: 12, lineHeight: 16 },
  status: { flexShrink: 1, textAlign: 'right', marginLeft: Spacing.two },
  flex: { flex: 1, paddingRight: Spacing.two },
  center: { textAlign: 'center', fontSize: 12 },
});
