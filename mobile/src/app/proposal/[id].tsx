import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { orderText, STATUS_TONE } from '@/components/proposal-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Loading, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useData } from '@/hooks/use-data';
import { api, type Proposal } from '@/lib/api';
import { moveText, num, pct, price, shortAddr, usd } from '@/lib/format';
import { errorMessage, executeProposal, loadMarket, type Execution, type Market } from '@/lib/hl';
import { minimumSize, protectionPrices, roundSizeDown } from '@/lib/order-math';
import { loadPrefs, type LocalPrefs } from '@/lib/prefs';
import { useAccount, useSession } from '@/lib/session';

const C = Colors.dark;
const SLIPPAGES = [0.005, 0.01, 0.02];
const NOTES: Record<string, string> = {
  no_position: "You hold nothing copied from this trader in this market, so there's nothing to reduce.",
  unavailable: "This market isn't tradable on your network.",
  no_equity: 'Your account has no margin to copy with.',
  too_small: 'At your multiplier this copy rounds to zero. Raise the multiplier in Settings to follow trades this size.',
  reverted: 'The trader reversed this move before you answered the previous alert.',
  below_min: "At your size this copy is below Hyperliquid's $10 minimum order. You can bump it to the minimum.",
};

export default function ProposalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const account = useAccount();
  const { authed } = useSession();
  const proposal = useData(() => authed((t) => api.proposal(t, Number(id))), id);

  if (!account) return <Screen><ErrorText>Connect your account first.</ErrorText></Screen>;
  if (proposal.error) return <Screen><ErrorText>{proposal.error}</ErrorText></Screen>;
  if (!proposal.data) return <Screen><Loading /></Screen>;
  return <Review p={proposal.data} serverNow={proposal.data.server_time} onChanged={proposal.refresh} />;
}

function Review({ p, serverNow, onChanged }: { p: Proposal; serverNow: number; onChanged: () => void }) {
  const account = useAccount()!;
  const { authed } = useSession();
  const [market, setMarket] = useState<Market | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<LocalPrefs | null>(null);
  const [sizeText, setSizeText] = useState(String(p.size));
  const [slippage, setSlippage] = useState(0.01);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Execution | null>(null);
  const [clock, setClock] = useState(() => Date.now() / 1000);
  const [offset] = useState(() => serverNow - Date.now() / 1000);

  useEffect(() => {
    loadPrefs().then((pr) => {
      setPrefs(pr);
      setSlippage(pr.slippage);
    });
    const t = setInterval(() => setClock(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (p.size <= 0) return;
    let alive = true;
    const pull = () =>
      loadMarket(account.network, p.coin)
        .then((m) => alive && (setMarket(m), setMarketError(null)))
        .catch((e) => alive && setMarketError(errorMessage(e)));
    pull();
    const t = setInterval(pull, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account.network, p.coin, p.size]);

  const secondsLeft = Math.floor(p.expires_at - (clock + offset));
  const actionable = p.status === 'pending' && p.size > 0 && secondsLeft > 0;
  const size = market ? roundSizeDown(Number(sizeText) || 0, market.szDecimals) : Number(sizeText) || 0;
  const notional = market ? size * market.mid : null;
  const belowMin = !p.reduce_only && notional != null && notional < 10;
  const protect = market ? protectionPrices(market.mid, p.is_buy, p.sl_pct, p.tp_pct) : {};
  const drift = market && p.ref_px ? market.mid / p.ref_px - 1 : null;

  async function approve() {
    setError(null);
    if (prefs?.requireBiometrics && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())) {
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: `Sign: ${orderText({ ...p, size })}` });
      if (!auth.success) return;
    }
    setBusy('approve');
    try {
      const exec = await executeProposal({ network: account.network, agent: account.agent, proposal: p, size, slippage });
      const result = { avgPx: exec.avgPx, oid: exec.oid, protection: exec.protection, warnings: exec.warnings };
      if (exec.filledSize > 0) {
        await authed((t) => api.decide(t, p.id, 'approved', { filled_size: exec.filledSize, result }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDone(exec);
      } else {
        await authed((t) => api.decide(t, p.id, 'failed', { result: { ...result, error: 'nothing filled' } }));
        setError('Nothing filled: the price moved beyond your slippage. Try a wider slippage.');
      }
      onChanged();
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      authed((t) => api.decide(t, p.id, 'failed', { result: { error: msg } })).catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    try {
      await authed((t) => api.decide(t, p.id, 'rejected'));
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Card>
        <Row style={styles.between}>
          <ThemedText type="small" themeColor="textSecondary">
            {shortAddr(p.leader)}
          </ThemedText>
          {actionable ? (
            <Chip label={`expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`} tone="warning" />
          ) : (
            <Chip label={p.status === 'pending' ? 'expired' : p.status} tone={STATUS_TONE[p.status]} />
          )}
        </Row>
        <ThemedText type="default" style={styles.move}>
          {moveText(p)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Their position: {num(p.leader_from)} → {num(p.leader_to)} {p.coin}
          {p.leader_px ? ` at ~${price(p.leader_px)}` : ''}
        </ThemedText>
        <Row>
          <Button title="View trader" kind="ghost" onPress={() => router.push(`/leader/${p.leader}`)} />
        </Row>
      </Card>

      {p.note && p.size <= 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {NOTES[p.note] ?? 'No copy proposed.'}
          </ThemedText>
        </Card>
      ) : null}

      {p.size > 0 ? (
        <>
          <SectionTitle>Your copy</SectionTitle>
          <Card>
            <ThemedText type="smallBold" style={{ color: p.is_buy ? C.accent : C.negative, fontSize: 18 }}>
              {p.is_buy ? 'BUY' : 'SELL'} {p.coin}
              {p.reduce_only ? ' · reduce only' : ''}
            </ThemedText>
            <Row style={styles.sizeRow}>
              <TextInput
                value={sizeText}
                onChangeText={setSizeText}
                editable={actionable && !done}
                keyboardType="decimal-pad"
                style={styles.input}
                accessibilityLabel={`Size in ${p.coin}`}
              />
              <ThemedText themeColor="textSecondary">{p.coin}</ThemedText>
            </Row>
            {actionable && !done ? (
              <Row style={styles.wrap}>
                {[0.5, 1, 2].map((k) => (
                  <Chip key={k} label={`${k}×`} selected={Number(sizeText) === p.size * k} onPress={() => setSizeText(String(p.size * k))} />
                ))}
                {market && belowMin ? (
                  <Chip label="Minimum ($10)" tone="warning" onPress={() => setSizeText(String(minimumSize(market.mid, market.szDecimals)))} />
                ) : null}
              </Row>
            ) : null}
            <Row style={styles.wrap}>
              <Stat label="Price now" value={market ? price(market.mid) : '—'} />
              <Stat label="Value" value={usd(notional)} />
              <Stat label="Leverage" value={p.leverage ? `${Math.min(p.leverage, market?.maxLeverage ?? p.leverage)}×` : '—'} />
            </Row>
            {drift != null && Math.abs(drift) > 0.002 ? (
              <ThemedText type="small" style={{ color: Math.abs(drift) > 0.01 ? C.warning : C.textSecondary }}>
                Price moved {pct(drift, true)} since the alert.
              </ThemedText>
            ) : null}
            {marketError ? <ErrorText>{marketError}</ErrorText> : null}
          </Card>

          {!p.reduce_only ? (
            <Card>
              <ThemedText type="smallBold">Protection</ThemedText>
              <Row style={styles.wrap}>
                <Stat label={`Stop-loss${p.sl_pct ? ` (${p.sl_pct}%)` : ''}`} value={protect.stopLoss ? price(protect.stopLoss) : 'off'} tone="negative" />
                <Stat label={`Take-profit${p.tp_pct ? ` (${p.tp_pct}%)` : ''}`} value={protect.takeProfit ? price(protect.takeProfit) : 'off'} tone="positive" />
              </Row>
              <ThemedText type="small" themeColor="textSecondary">
                Placed on Hyperliquid with the order and only active once it fills. Change the defaults in Settings.
              </ThemedText>
            </Card>
          ) : null}

          {actionable && !done ? (
            <Card>
              <ThemedText type="smallBold">Max slippage</ThemedText>
              <Row>
                {SLIPPAGES.map((s) => (
                  <Chip key={s} label={pct(s)} selected={slippage === s} onPress={() => setSlippage(s)} />
                ))}
              </Row>
            </Card>
          ) : null}
        </>
      ) : null}

      {p.note && p.size > 0 ? (
        <ThemedText type="small" style={{ color: C.warning }}>
          {NOTES[p.note]}
        </ThemedText>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}

      {done ? (
        <Card style={styles.success}>
          <ThemedText type="smallBold" style={{ color: C.accent }}>
            Filled {num(done.filledSize)} {p.coin} at {price(done.avgPx)}
          </ThemedText>
          {done.filledSize < size ? (
            <ThemedText type="small" themeColor="textSecondary">
              Partial fill: the rest of the order didn&apos;t match within your slippage.
            </ThemedText>
          ) : null}
          {done.protection.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              Stop-loss / take-profit: {done.protection.join(', ')}
            </ThemedText>
          ) : null}
          {done.warnings.map((w) => (
            <ThemedText key={w} type="small" style={{ color: C.warning }}>
              {w}
            </ThemedText>
          ))}
          <Button title="Done" kind="secondary" onPress={() => router.back()} />
        </Card>
      ) : actionable ? (
        <View style={styles.actions}>
          <Button
            title={busy === 'approve' ? 'Signing…' : `Approve ${p.is_buy ? 'buy' : 'sell'}`}
            onPress={approve}
            busy={busy === 'approve'}
            disabled={!market || size <= 0 || (belowMin && !p.reduce_only) || busy !== null}
          />
          <Button title="Reject" kind="danger" onPress={reject} busy={busy === 'reject'} disabled={busy !== null} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Signed on this phone and sent straight to Hyperliquid.
          </ThemedText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  move: { fontSize: 20, lineHeight: 28 },
  sizeRow: { marginVertical: Spacing.one },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 28,
    fontWeight: '600',
    backgroundColor: C.background,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  success: { borderColor: C.accent },
  center: { textAlign: 'center' },
});
