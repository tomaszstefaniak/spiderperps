import '@/lib/polyfills';

import * as Notifications from 'expo-notifications';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { api } from '@/lib/api';
import { proposalIdFrom, REJECT_ACTION, setupCategories } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

const C = Colors.dark;
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.background, card: C.background, primary: C.accent, border: C.border },
};

/** Opens the proposal a notification was about; "Reject" works without opening the app. */
function NotificationRouter() {
  const { state, authed } = useSession();
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    setupCategories().catch(() => {});
  }, []);

  useEffect(() => {
    if (state.status !== 'signedIn' || !last) return;
    const id = proposalIdFrom(last);
    if (last.actionIdentifier === REJECT_ACTION && id != null) {
      authed((t) => api.decide(t, id, 'rejected')).catch(() => {});
    } else if (id != null) {
      router.push(`/proposal/${id}`);
    } else {
      router.navigate('/');
    }
    Notifications.clearLastNotificationResponse();
  }, [last, state.status, authed]);

  return null;
}

function Root() {
  const { state } = useSession();
  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync();
  }, [state.status]);

  return (
    <>
      <NotificationRouter />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.background },
          headerTintColor: C.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ presentation: 'modal', title: 'Connect account' }} />
        <Stack.Screen name="proposal/[id]" options={{ title: 'Review copy' }} />
        <Stack.Screen name="leader/[address]" options={{ title: 'Trader' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <SessionProvider>
        <Root />
      </SessionProvider>
    </ThemeProvider>
  );
}
