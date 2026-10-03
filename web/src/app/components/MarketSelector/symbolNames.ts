// Human-readable names for common Hyperliquid markets.
// Safe fallback: return the symbol itself when unknown.

const MAP: Record<string, string> = {
  // Majors
  BTC: 'Bitcoin',
  XBT: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  BNB: 'BNB',
  XRP: 'XRP',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  SHIB: 'Shiba Inu',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  TON: 'TON',
  TRX: 'TRON',
  DOT: 'Polkadot',

  // L2 / Infra / L1s
  ARB: 'Arbitrum',
  OP: 'Optimism',
  MATIC: 'Polygon',
  AVAX: 'Avalanche',
  ATOM: 'Cosmos',
  NEAR: 'NEAR',
  APT: 'Aptos',
  SUI: 'Sui',
  SEI: 'Sei',
  FIL: 'Filecoin',
  ICP: 'Internet Computer',
  EGLD: 'MultiversX',
  FTM: 'Fantom',
  ROSE: 'Oasis Network',
  KAS: 'Kaspa',
  CELO: 'Celo',
  XLM: 'Stellar',
  ALGO: 'Algorand',
  XMR: 'Monero',
  XTZ: 'Tezos',
  AR: 'Arweave',
  TIA: 'Celestia',

  // DeFi blue chips
  UNI: 'Uniswap',
  AAVE: 'Aave',
  MKR: 'Maker',
  LDO: 'Lido DAO',
  CRV: 'Curve DAO',
  SNX: 'Synthetix',
  COMP: 'Compound',
  SUSHI: 'Sushi',
  YFI: 'yearn.finance',
  GMX: 'GMX',
  DYDX: 'dYdX',
  INJ: 'Injective',
  RUNE: 'THORChain',
  BAL: 'Balancer',
  '1INCH': '1inch',           // ← must be quoted (numeric-leading key)
  ONEINCH: '1inch',           // alias that some sources use
  CAKE: 'PancakeSwap',
  JOE: 'Trader Joe',

  // Infra / Oracles / Data
  LINK: 'Chainlink',
  PYTH: 'Pyth Network',
  GRT: 'The Graph',
  OCEAN: 'Ocean Protocol',
  ARKM: 'Arkham',
  RNDR: 'Render',
  AKT: 'Akash Network',
  IMX: 'Immutable',
  ENA: 'Ethena',
  ETHFI: 'ether.fi',
  STRK: 'Starknet',

  // Solana ecosystem
  JTO: 'Jito',
  JUP: 'Jupiter',
  ORCA: 'Orca',
  BONK: 'Bonk',
  WIF: 'dogwifhat',
  RAY: 'Raydium',

  // Popular CEX / Social / AI
  WLD: 'Worldcoin',
  PEPE: 'Pepe',
  FLOKI: 'Floki',
  MEME: 'Memecoin',
  TNSR: 'Tensor',
  DEGEN: 'Degen',
  BLUR: 'Blur',
  APE: 'ApeCoin',
  GMT: 'STEPN',

  // Extras frequently seen
  SFP: 'SafePal',
  SKL: 'SKALE',
  ZETA: 'ZetaChain',
  ZRO: 'LayerZero',
  MINA: 'Mina',
  HBAR: 'Hedera',
  SAND: 'The Sandbox',
  MANA: 'Decentraland',
  AXS: 'Axie Infinity',
  CHZ: 'Chiliz',
  GALA: 'Gala',
  ENS: 'Ethereum Name Service',
  STX: 'Stacks',
  NEO: 'NEO',
  KSM: 'Kusama',

  // From your earlier list
  AIXBT: 'AIXBT',
  ACE: 'ACE',
  AI: 'AI',
  ALT: 'ALT',
  ANIME: 'Anime',
};

export function nameForSymbol(sym: string): string {
  const s = (sym || '').toUpperCase();
  return MAP[s] ?? s;
}

export const SYMBOL_NAME_MAP = MAP;
