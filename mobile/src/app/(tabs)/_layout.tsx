import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useData } from '@/hooks/use-data';
import { api } from '@/lib/api';
import { useAccount, useSession } from '@/lib/session';

const C = Colors.dark;

export default function TabLayout() {
  const account = useAccount();
  const { authed } = useSession();
  const pending = useData(
    async () => (account ? (await authed((t) => api.proposals(t, 'pending'))).proposals.length : 0),
    account?.address ?? 'signed-out',
    15_000,
  );
  const count = pending.data ?? 0;

  return (
    <NativeTabs
      backgroundColor={C.background}
      indicatorColor={C.backgroundSelected}
      tintColor={C.accent}
      labelStyle={{ selected: { color: C.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tray.full" />
        {count > 0 ? <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="following">
        <NativeTabs.Trigger.Label>Following</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
