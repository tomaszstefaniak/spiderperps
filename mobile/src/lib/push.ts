import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

export const PROPOSAL_CATEGORY = 'proposal';
export const REJECT_ACTION = 'reject';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Must match the category the server sends with actionable proposals. */
export async function setupCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(PROPOSAL_CATEGORY, [
    // Approving signs an order, so it always happens in the app (with Face ID if enabled).
    { identifier: 'review', buttonTitle: 'Review', options: { opensAppToForeground: true } },
    { identifier: REJECT_ACTION, buttonTitle: 'Reject', options: { opensAppToForeground: false, isDestructive: true } },
  ]);
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/**
 * Ask for permission and register this device's Expo push token with the server.
 * Without an EAS project id (set by `eas init`) there's no token - the in-app inbox still works.
 */
export async function registerForPush(authed: <T>(call: (token: string) => Promise<T>) => Promise<T>): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'No EAS project id yet - run `eas init` to enable push.' };

  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, reason: 'Notifications are turned off for this app.' };
  if (!Device.isDevice && Platform.OS === 'android') return { ok: false, reason: 'Push needs a real Android device.' };

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await authed((t) => api.registerDevice(t, token, Platform.OS === 'ios' ? 'ios' : 'android'));
  return { ok: true };
}

/** proposalId from a notification tap, if it was about a single proposal. */
export function proposalIdFrom(response: Notifications.NotificationResponse | null | undefined): number | null {
  const data = response?.notification.request.content.data as { proposalId?: number } | undefined;
  return typeof data?.proposalId === 'number' ? data.proposalId : null;
}
