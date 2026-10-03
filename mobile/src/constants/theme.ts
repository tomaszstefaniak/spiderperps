/**
 * Dark-only palette: a trading app reads better on dark, and it matches the web app.
 */

import '@/global.css';

import { Platform } from 'react-native';

const dark = {
  text: '#F4F5F7',
  background: '#0B0C0E',
  backgroundElement: '#17191C',
  backgroundSelected: '#23262B',
  textSecondary: '#9AA0A8',
  border: '#2A2E34',
  accent: '#72F2B6', // brand mint (also "long"/positive)
  accentText: '#04140C',
  negative: '#F87171',
  warning: '#FBBF24',
  info: '#7AB8FF',
} as const;

// The app is dark-only; both keys point at the same palette so existing helpers keep working.
export const Colors = { light: dark, dark } as const;

export type ThemeColor = keyof typeof dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 8, medium: 14, large: 20, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
