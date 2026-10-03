import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { PrivateKeyAccount } from 'viem/accounts';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Row, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { WEB_URL, type Network } from '@/lib/config';
import { shortAddr } from '@/lib/format';
import { errorMessage } from '@/lib/hl';
import { agentName, ensureAgent } from '@/lib/keys';
import { registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

const C = Colors.dark;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_HOST = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export default function ConnectScreen() {
  const { signIn, authed } = useSession();
  const [network, setNetwork] = useState<Network>('testnet');
  const [agent, setAgent] = useState<PrivateKeyAccount | null>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const finishing = useRef(false);

  const link = agent
    ? `${WEB_URL}/link?agent=${agent.address}&network=${network}&name=${encodeURIComponent(agentName(agent.address))}`
    : null;
  // MetaMask opens dapp links over https only, and phone apps can't reach a computer's local
  // network - so wallet apps need the deployed https page; a dev server only works from a desktop browser.
  const metamaskLink = link ? `https://metamask.app.link/dapp/${link.replace(/^https?:\/\//, '')}` : null;
  const devUrl = !WEB_URL.startsWith('https://') || PRIVATE_HOST.test(WEB_URL);

  async function copyLink() {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    setCopied(true);
  }

  async function start() {
    setError(null);
    setAgent(await ensureAgent(network));
  }

  async function finish(address: `0x${string}`) {
    if (!agent || finishing.current) return;
    finishing.current = true;
    try {
      setStatus('Signing in…');
      await signIn(network, address, agent);
      setStatus('Turning on notifications…');
      await registerForPush(authed).catch(() => null);
      router.dismissAll();
      router.replace('/');
    } catch (e) {
      finishing.current = false;
      setStatus(null);
      setError(
        e instanceof ApiError && e.status === 401
          ? "Hyperliquid doesn't list this phone's key for that account yet. Approve it first, then try again."
          : errorMessage(e),
      );
    }
  }

  // Wait for the approval page to report the account that approved this phone's key.
  useEffect(() => {
    if (!agent) return;
    const t = setInterval(async () => {
      try {
        const { address } = await api.linkedAccount(agent.address, network);
        clearInterval(t);
        finish(address as `0x${string}`);
      } catch {
        /* not approved yet */
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, network]);

  if (!agent) {
    return (
      <Screen>
        <ThemedText type="default">Which Hyperliquid network?</ThemedText>
        <Card onPress={() => setNetwork('testnet')} style={network === 'testnet' && styles.selected}>
          <Row style={styles.between}>
            <ThemedText type="smallBold">Testnet</ThemedText>
            <Chip label="recommended to start" tone="warning" />
          </Row>
          <ThemedText type="small" themeColor="textSecondary">
            Copy real mainnet traders with test funds. Nothing you do here costs money.
          </ThemedText>
        </Card>
        <Card onPress={() => setNetwork('mainnet')} style={network === 'mainnet' && styles.selected}>
          <ThemedText type="smallBold">Mainnet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Real funds. Every copy still needs your approval.
          </ThemedText>
        </Card>
        <Button title="Continue" onPress={start} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="default">Approve this phone on Hyperliquid</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        This phone made a trading-only key ({shortAddr(agent.address)}). Approve it once with the wallet that holds your
        Hyperliquid account. The key can place orders for you but can never withdraw or transfer funds, and you can revoke it on
        Hyperliquid any time.
      </ThemedText>

      {devUrl ? (
        <Card style={styles.warn}>
          <ThemedText type="smallBold" style={{ color: C.warning }}>
            Development link
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The approval page is on {WEB_URL}, which wallet apps on a phone can&apos;t open: they need a public https address.
            Copy the link into a desktop browser with the MetaMask extension; this screen continues on its own once you approve.
          </ThemedText>
          <Button title={copied ? 'Link copied' : 'Copy link'} onPress={copyLink} />
        </Card>
      ) : (
        <>
          <Button title="Approve in MetaMask" onPress={() => metamaskLink && Linking.openURL(metamaskLink)} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Opens MetaMask on this phone. Approve, then come back here.
          </ThemedText>
          <Button title={copied ? 'Link copied' : 'Other wallet: copy link'} kind="secondary" onPress={copyLink} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Paste it into your wallet app&apos;s built-in browser.
          </ThemedText>
          <Button
            title={showQr ? 'Hide QR code' : 'Wallet on another phone? Show QR code'}
            kind="ghost"
            onPress={() => setShowQr((v) => !v)}
          />
          {showQr && metamaskLink ? (
            <Card style={styles.center}>
              <View style={styles.qr}>
                <QRCode value={metamaskLink} size={200} backgroundColor="#FFFFFF" color="#000000" />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Scan with the other phone&apos;s camera: it opens the approval page in MetaMask.
              </ThemedText>
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {status ?? 'Waiting for your approval…'}
        </ThemedText>
      </Card>

      <ThemedText type="small" themeColor="textSecondary">
        Already approved this key? Enter the account address:
      </ThemedText>
      <TextInput
        value={manual}
        onChangeText={setManual}
        placeholder="0x…"
        placeholderTextColor={C.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Button
        title="Sign in"
        kind="secondary"
        disabled={!ADDRESS.test(manual.trim())}
        onPress={() => finish(manual.trim().toLowerCase() as `0x${string}`)}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  selected: { borderColor: C.accent },
  warn: { borderColor: C.warning },
  between: { justifyContent: 'space-between' },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  qr: { padding: Spacing.three, backgroundColor: '#FFFFFF', borderRadius: Radius.medium },
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
