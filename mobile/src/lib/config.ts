// Set in .env (see .env.example). EXPO_PUBLIC_* values are inlined at build time.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8790').replace(/\/$/, '');
/** Web app that hosts the one-time "approve this phone" page. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export type Network = 'mainnet' | 'testnet';

export const APP_NAME = 'SpiderPerps';
