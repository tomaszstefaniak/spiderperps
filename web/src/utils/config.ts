import { API_URLS } from '@raydium-io/raydium-sdk-v2'

/* ───────── RPCs ───────── */
export const DEFAULT_RPC =
  process.env.REACT_APP_DEFAULT_RPC ||
  'https://thrilling-tiniest-water.solana-mainnet.quiknode.pro/768da938e14b68c60112db16a8135f95a36e92f1/'

export const HELIUS_API_KEY =
  process.env.REACT_APP_HELIUS_API_KEY ||
  'd342b0a4-82e8-450b-ac50-b57adaccffd7'

export const INITIAL_RPCS: { label: string; url: string }[] = [
  { label: 'Helius RPC',   url: `https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}` },
  { label: 'QuickNode RPC', url: DEFAULT_RPC }
]

/* ───────── fee config ───────── */
export const FEE_WALLET =
  process.env.REACT_APP_FEE_WALLET ||
  '8m1bJit7AyAsKEPZBNSDhoEKrrmqnoQ5bW4BNBQyH58C'

/* 0 .05 % = 0.0005 */
export const FEE_RATE = Number(process.env.REACT_APP_FEE_RATE || '0.0005')

/* Default TVL */
export const DEFAULT_TVL_THRESHOLD_USD = 20_000;

/* ─── list-trimming thresholds ─── */
export const MIN_POOL_TVL_USD      = Number(process.env.NEXT_PUBLIC_MIN_POOL_TVL    ?? 1_300);

/* ───────── Raydium v1 endpoint ───────── */
export const SWAP_HOST_V1 =
  process.env.REACT_APP_SWAP_HOST_V1 ||
  API_URLS.SWAP_HOST.replace('transaction.raydium.io', 'transaction-v1.raydium.io')

/* ───────── Popular Tokens ─────────
   - keep order - append more mints if you like                       */
export const POPULAR_TOKENS = new Set<string>([
  'So11111111111111111111111111111111111111112', // SOL (native)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC
  // 'ADD_MORE_MINTS_HERE'
])

/* ───────── misc ui ───────── */
export const BACKGROUND_IMAGES = [
  '/assets/images/background-10.webp',
  '/assets/images/background-20.webp',
  '/assets/images/background-30.webp',
  '/assets/images/background-40.webp',
  '/assets/images/background-50.webp'
]

export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
export const ENABLE_LOGGING =
  process.env.REACT_APP_ENABLE_LOGGING === 'true' || IS_DEVELOPMENT

export const logger = {
  debug:  (...a: any[]) => { if (ENABLE_LOGGING) console.debug(...a) },
  log:    (...a: any[]) => { if (ENABLE_LOGGING) console.log   (...a) },
  warn:   (...a: any[]) => console.warn (...a),
  error:  (...a: any[]) => console.error(...a)
}
