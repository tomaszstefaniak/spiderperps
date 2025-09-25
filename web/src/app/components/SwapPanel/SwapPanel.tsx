// src/app/components/SwapPanel/SwapPanel.tsx
'use client'

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
  lazy,
  Suspense,
} from 'react'
import useSWR from 'swr'
import styles from './SwapPanel.module.css'
import {
  PublicKey,
  ComputeBudgetProgram,
  Transaction,
} from '@solana/web3.js'
import type { QuoteResponse } from '../../workers/quoteWorker'
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { ammSwapDirect } from '../../raydium/ammSwap'
import { TxVersion } from '@raydium-io/raydium-sdk-v2'
import { VersionedTransaction } from '@solana/web3.js'
import {
  useAllTokens,
  CombinedTokenInfo,
} from '@/utils/useAllTokens'
import SwapSettingsModal from '../SwapSettingsModal/SwapSettingsModal'
import SwapInfoBox from '../SwapInfoBox/SwapInfoBox'
import SwapStatusModal, { SwapStatus } from '../SwapStatusModal/SwapStatusModal'
import SwapRow from '../SwapRow/SwapRow'
import { useConnection } from '../../context/SolanaContext'
import { FEE_RATE } from '@/utils/config'
import {
  normalizeError,
  createError,
  getUserFriendlyErrorMessage,
} from '@/utils/errorHandling'

const SelectTokenModal = lazy(() =>
  import('../SelectTokenModal/SelectTokenModal')
)

// ───────────────── constants ─────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112'
const NATIVE_SOL_KEY = 'NATIVE_SOL'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

// immediate placeholders
const PLACEHOLDER_SOL: CombinedTokenInfo = {
  mint: WSOL_MINT,
  symbol: 'SOL',
  name: 'Solana',
  decimals: 9,
  icon: '/assets/sol.png',
}
const PLACEHOLDER_USDC: CombinedTokenInfo = {
  mint: USDC_MINT,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  icon: '/assets/usdc.png',
}

export interface WalletType {
  publicKey: PublicKey
  signTransaction: (
    tx: Transaction | VersionedTransaction
  ) => Promise<Transaction | VersionedTransaction>
}

/* helper – detect Token-2022 mints */
function isToken2022Mint(
  mint: string,
  tokenList: CombinedTokenInfo[]
): boolean {
  return (
    tokenList.find(t => t.mint === mint)?.programId ===
    TOKEN_2022_PROGRAM_ID.toBase58()
  )
}

function isUserRejectError(err: unknown): boolean {
  if (!err) return false
  const code = (err as any).code
  const msg  = (err as any).message || ''
  return code === 4001 || /user rejected/i.test(msg)
}

// ───────────────── component ─────────────────
export default function SwapPanel({
  wallet,
  onConnectWallet,
}: {
  wallet: WalletType | null
  onConnectWallet(): void
}) {
  const connection = useConnection()
  const [, startTransition] = useTransition()

  /* 1) tokens (no global pools on first load) */
  const { tokens, loading: tokensLoading } = useAllTokens()

  /* 2) UI state */
  const [inputMint, setInputMint] = useState(WSOL_MINT)
  const [outputMint, setOutputMint] = useState(USDC_MINT)
  const [inputToken, setInputToken] =
    useState<CombinedTokenInfo>(PLACEHOLDER_SOL)
  const [outputToken, setOutputToken] =
    useState<CombinedTokenInfo>(PLACEHOLDER_USDC)
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState(1)
  const [speed, setSpeed] = useState<'fast' | 'turbo' | 'ultra'>('turbo')
  const [showIn, setShowIn] = useState(false)
  const [showOut, setShowOut] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  /* 3) pick transaction version automatically */
  const txVersion = useMemo(() => {
    const in22 = isToken2022Mint(inputMint, tokens)
    const out22 = isToken2022Mint(outputMint, tokens)
    return in22 || out22 ? TxVersion.Legacy : TxVersion.V0
  }, [inputMint, outputMint, tokens])
  const quoteTxVersion = txVersion === TxVersion.Legacy ? 'Legacy' : 'V0'

  /* 3a) replace placeholders when real list arrives */
  useEffect(() => {
    if (tokensLoading || !tokens.length) return
    const sol = tokens.find(t => t.mint === WSOL_MINT || t.mint === NATIVE_SOL_KEY)
    const usdc = tokens.find(t => t.mint === USDC_MINT)
    if (sol) {
      setInputMint(sol.mint)
      setInputToken(sol)
    }
    if (usdc) {
      setOutputMint(usdc.mint)
      setOutputToken(usdc)
    }
  }, [tokensLoading, tokens])

  /* 4) quote via SWR */
  const rawIn = Math.floor((+amountIn || 0) * 10 ** inputToken.decimals)
  const netIn = rawIn - Math.floor(rawIn * FEE_RATE)
  const apiIn = inputMint === NATIVE_SOL_KEY ? WSOL_MINT : inputMint
  const apiOut = outputMint === NATIVE_SOL_KEY ? WSOL_MINT : outputMint
  const slippageBps = Math.floor(slippage * 100)
  const wrapSol = inputMint === NATIVE_SOL_KEY
  const unwrapSol = outputMint === NATIVE_SOL_KEY

  const parsedIn = parseFloat(amountIn || '0');
  const shouldQuote = parsedIn > 0;
  const quoteKey =
    shouldQuote && inputToken && outputToken
      ? `/api/quote?inputMint=${apiIn}&outputMint=${apiOut}` +
        `&amount=${netIn}&slippageBps=${slippageBps}` +
        `&txVersion=${quoteTxVersion}&wrapSol=${wrapSol}&unwrapSol=${unwrapSol}`
      : null;


  const { data: quote, error: quoteErr, isValidating } = useSWR<QuoteResponse>(
    quoteKey!,
    u => fetch(u!).then(r => r.json()),
    { refreshInterval: 15_000 }
  )

  const isRefreshing = Boolean(isValidating)
  const quoteRawOut = quote?.outRaw ?? 0
  const priceImpact = quote?.priceImpact ?? '0.00%'
  const routeCount = quote?.routeCount ?? 0
  const minReceived = quote
    ? (Number(quote.minReceived) / 10 ** outputToken.decimals).toFixed(
        outputToken.decimals
      )
    : ''
  const uiBestCase = useMemo(() => {
    const outBig = BigInt(quoteRawOut)
    const dp = BigInt(10) ** BigInt(outputToken.decimals)
    const whole = outBig / dp
    const frac = (outBig % dp).toString().padStart(outputToken.decimals, '0')
    return `${whole}.${frac}`
  }, [quoteRawOut, outputToken.decimals])

  // 5) balances
  const [spl, setSpl]       = useState<{ mint: string; amount: number }[]>([]);
  const [solBal, setSolBal] = useState<number>(0);
  const [balLoading, setBalLoading] = useState<boolean>(true);
  const rpcCache = useRef(new Map<string, any>());

  const getParsed = useCallback(
    async (owner?: PublicKey) => {
      if (!owner) return [];
      const key = `parsed-${owner.toBase58()}`;
      if (rpcCache.current.has(key)) return rpcCache.current.get(key);

     const [legacy, v2022] = await Promise.all([
       connection.getParsedTokenAccountsByOwner(owner, {
         programId: TOKEN_PROGRAM_ID,
       }),
       connection.getParsedTokenAccountsByOwner(owner, {
         programId: TOKEN_2022_PROGRAM_ID,
       }),
     ]);

     const merged = [...legacy.value, ...v2022.value];
     rpcCache.current.set(key, merged);
     return merged;
    },
    [connection]
  );

  const getBal = useCallback(
    async (owner?: PublicKey) => {
      if (!owner) return 0;
      const key = `bal-${owner.toBase58()}`;
      if (rpcCache.current.has(key)) return rpcCache.current.get(key);
      const b = await connection.getBalance(owner);
      rpcCache.current.set(key, b);
      return b;
    },
    [connection]
  );

  const refreshBalances = useCallback(
    async () => {
      if (!wallet) return;
      setBalLoading(true);
      rpcCache.current.clear();

      const parsed = await getParsed(wallet.publicKey);
      const spls = (parsed as any[]).map((a) => ({
        mint:   a.account.data.parsed.info.mint,
        amount: a.account.data.parsed.info.tokenAmount.uiAmount || 0,
      }));
      const lam = await getBal(wallet.publicKey);

      setSpl(spls);
      setSolBal(lam / 1e9);
      setBalLoading(false);
    },
    [wallet, getParsed, getBal]
  );

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    if (!wallet) return;
    const tSub = connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      refreshBalances,
      'confirmed',
      [
        { dataSize: 165 },
        { memcmp: { offset: 32, bytes: wallet.publicKey.toBase58() } },
      ]
    );

    const t22Sub = connection.onProgramAccountChange(
      TOKEN_2022_PROGRAM_ID,
      refreshBalances,
      'confirmed',
      [
        { dataSize: 165 },
        { memcmp: { offset: 32, bytes: wallet.publicKey.toBase58() } },
      ]
    );

    const sSub = connection.onAccountChange(
      wallet.publicKey,
      refreshBalances,
      'confirmed'
    );
    return () => {
      connection.removeProgramAccountChangeListener(tSub);
      connection.removeProgramAccountChangeListener(t22Sub);
      connection.removeAccountChangeListener(sSub);
    };
  }, [wallet, connection, refreshBalances]);

  const augTokens = useMemo(() => {
    if (tokensLoading) return [];
    const m = new Map<string, number>();
    spl.forEach((a) => m.set(a.mint, a.amount));
    m.set(NATIVE_SOL_KEY, solBal);
    return tokens.map((t) => ({
      ...t,
      balance: m.get(t.mint)! > 0 ? m.get(t.mint)!.toString() : undefined,
    }));
  }, [tokens, tokensLoading, spl, solBal]);

  const balanceMap = useMemo(
    () =>
      Object.fromEntries(
        augTokens
          .filter((t) => t.balance)
          .map((t) => [t.mint, t.balance!] as [string, string])
      ),
    [augTokens]
  );

  // 6) default token pair
  useEffect(() => {
    if (!tokensLoading && tokens.length) {
      const sol = tokens.find((t) => t.mint === WSOL_MINT || t.mint === NATIVE_SOL_KEY);
      const usd = tokens.find((t) => t.mint === USDC_MINT);
      if (sol) { setInputMint(sol.mint);   setInputToken(sol); }
      if (usd) { setOutputMint(usd.mint); setOutputToken(usd); }
    }
  }, [tokensLoading, tokens]);

  // 7) network fee
  const [networkFee, setNetworkFee] = useState('0.000000 SOL');
  useEffect(() => {
    if (!wallet) return;
    (async () => {
      try {
        const { blockhash } = await connection.getLatestBlockhash();
        const tx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: wallet.publicKey,
        });
        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({
            units: speed === 'ultra' ? 1200000 : speed === 'turbo' ? 800000 : 400000,
          })
        );
        tx.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: speed === 'ultra' ? 10 : speed === 'turbo' ? 5 : 0,
          })
        );
        const resp = await connection.getFeeForMessage(tx.compileMessage());
        setNetworkFee(`${(resp.value! / 1e9).toFixed(6)} SOL`);
      } catch (err: unknown) {
         const appErr = normalizeError(err);
         createError(appErr.type, appErr.message, { originalError: err });
         setNetworkFee('0.000000 SOL');
      }
    })();
  }, [wallet, speed, connection]);

  // 8) swap logic
  const rawAmountIn  = useMemo(
    () =>
      inputToken
        ? Math.floor(parseFloat(amountIn) * 10 ** inputToken.decimals)
        : 0,
    [amountIn, inputToken]
  );

  const minAmountOut = useMemo(
    () => Math.floor(quoteRawOut * (1 - slippage / 100)),
    [quoteRawOut, slippage]
  );

  const handleSelectIn = useCallback((t: CombinedTokenInfo) => {
    setInputMint(t.mint);
    setInputToken(t);
    setAmountIn('');
    setShowIn(false);
  }, []);

  const handleSelectOut = useCallback((t: CombinedTokenInfo) => {
    setOutputMint(t.mint);
    setOutputToken(t);
    setShowOut(false);
  }, []);

  const onFlip = () => {
    const prevIn     = inputMint;
    const prevTokIn  = inputToken;
    setInputMint(outputMint);
    setInputToken(outputToken);
    setOutputMint(prevIn);
    setOutputToken(prevTokIn);
    setAmountIn('');
  };

  const handleAmountChange = useCallback((v: string) => {
    if (/^\d*\.?\d*$/.test(v)) setAmountIn(v);
  }, []);

  // 9) Swap button state
  let swapDisabled = false;
  let swapLabel = 'Swap';

  const available = parseFloat(
    augTokens.find((t) => t.mint === inputMint)?.balance || '0'
  );

  if (!wallet) {
    swapDisabled = false;
    swapLabel = 'Connect Wallet';
  } else if (tokensLoading) {
    swapDisabled = true;
    swapLabel = 'Loading tokens…';
  } else if (!shouldQuote) {
    swapDisabled = true;
    swapLabel = 'Enter an amount';
  } else if (quoteErr) {
    swapDisabled = true;
    swapLabel = 'Quote unavailable';
  } else if (isRefreshing) {
    swapDisabled = true;
    swapLabel = 'Updating quote…';
  } else if (!isRefreshing && (routeCount ?? 0) === 0) {
    swapDisabled = true;
    swapLabel = 'No route';
  } else if (parsedIn > available) {
    swapDisabled = true;
    swapLabel = `Insufficient ${inputToken.symbol}`;
  }

  const rateLabel = useMemo(() => {
    if (!inputToken || !outputToken || !amountIn || +amountIn <= 0) return '';
    const totalOut = quoteRawOut / 10 ** outputToken.decimals;
    return `1 ${inputToken.symbol} ≈ ${(
      totalOut / parseFloat(amountIn)
    ).toFixed(outputToken.decimals)} ${outputToken.symbol}`;
  }, [quoteRawOut, amountIn, inputToken, outputToken]);

  const [swapStatus, setSwapStatus] = useState<SwapStatus>('idle')
  const [swapError,  setSwapError]  = useState<string | null>(null)
  const [txSig,      setTxSig]      = useState<string | null>(null)

  // 10) perform swap – pass dummy poolId (HTTP path ignores it)
  const performSwap = useCallback(async () => {
    try {
      const { txid, blockhash, lastValidBlockHeight } = await ammSwapDirect({
        walletPubkey: wallet!.publicKey,
        signTransaction: wallet!.signTransaction,
        poolId: 'unused', // no global pools required
        amountIn: rawAmountIn,
        minAmountOut,
        slippageBps,
        inputMint: apiIn,
        outputMint: apiOut,
        makeTxVersion: txVersion,
        config: {
          inputUseSolBalance:  inputMint === NATIVE_SOL_KEY,
          outputUseSolBalance: outputMint === NATIVE_SOL_KEY,
        },
        preInstructions: [
          ComputeBudgetProgram.setComputeUnitLimit({
            units:
              speed === 'ultra'
                ? 1_200_000
                : speed === 'turbo'
                ? 800_000
                : 400_000,
          }),
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports:
              speed === 'ultra'
                ? 10
                : speed === 'turbo'
                ? 5
                : 0,
          }),
        ],
      })

      setTxSig(txid);
      startTransition(() => setSwapStatus('processing'));
      refreshBalances();
      const listener = connection.onSignature(
        txid,
        () => {
          refreshBalances();
          connection.removeSignatureListener(listener);
        },
        'confirmed'
      );
      await connection.confirmTransaction(
        { signature: txid, blockhash, lastValidBlockHeight },
        'confirmed'
      );
      startTransition(() => setSwapStatus('confirmed'));
    } catch (err: any) {
       const appErr = normalizeError(err);
       createError(appErr.type, appErr.message, { originalError: err });
       const msg = isUserRejectError(err)
         ? 'User rejected transaction'
         : getUserFriendlyErrorMessage(appErr);
      startTransition(() => {
        setSwapError(msg);
        setSwapStatus('failed');
      });
    }
  }, [
    wallet,
    rawAmountIn,
    minAmountOut,
    slippageBps,
    apiIn,
    apiOut,
    txVersion,
    speed,
    connection,
    refreshBalances,
    inputMint,
    outputMint,
  ]);

  const handleSwap = useCallback(() => {
    if (!wallet || !inputToken || !outputToken) {
      onConnectWallet();
      return;
    }
    setSwapStatus('signing');
    performSwap();
  }, [wallet, inputToken, outputToken, onConnectWallet, performSwap]);

  useEffect(() => {
    if (swapStatus === 'confirmed' || swapStatus === 'failed') {
      const t = setTimeout(() => setSwapStatus('idle'), 8000);
      return () => clearTimeout(t);
    }
  }, [swapStatus]);

  // ────────────────────────── RENDER ──────────────────────────
  return (
    <div className={styles.swapContainer}>
      <div className={styles.swapCard}>
        {/* Settings icon */}
        <div
          className={styles.swapSettingsIcon}
          onClick={() => setShowSettings(true)}
        >
          <img src="/assets/gear-4.svg" alt="Settings" className={styles.gearIcon} />
        </div>

        {/* Sell row */}
        <SwapRow
          label="Sell"
          amount={amountIn}
          tokenSymbol={inputToken.symbol}
          tokenIcon={inputToken.icon}
          disabled={tokensLoading}
          balance={augTokens.find((t) => t.mint === inputMint)?.balance}
          showBalance={!!wallet && !balLoading}
          onAmountChange={handleAmountChange}
          onOpenSelector={() => {
            if (!tokensLoading) {
              setShowIn(true);
            }
          }}
        />

        {/* Flip arrow */}
        <div className={styles.swapArrow}>
          <button className={styles.arrowButton} onClick={onFlip}>
            <img src="/assets/arrow-2.svg" alt="Flip" className={styles.arrowIcon} />
          </button>
        </div>

        {/* Buy row */}
        <SwapRow
          label="Buy"
          amount={uiBestCase}
          tokenSymbol={outputToken.symbol}
          tokenIcon={outputToken.icon}
          disabled={false}
          balance={augTokens.find((t) => t.mint === outputMint)?.balance}
          showBalance={!!wallet && !balLoading}
          onOpenSelector={() => {
            if (!tokensLoading) {
              setShowOut(true);
            }
          }}
        />

        {/* Swap button */}
        <button
          className={styles.swapButton}
          onClick={wallet ? handleSwap : onConnectWallet}
          disabled={swapDisabled}
        >
          {swapLabel}
        </button>

        {/* Token pickers */}
        {showIn && (
          <Suspense fallback={<div className={styles.modalLoading} />}>
            <SelectTokenModal
              visible={showIn}
              onClose={() => setShowIn(false)}
              onSelect={handleSelectIn}
              balanceMap={balanceMap}
            />
          </Suspense>
        )}
        {showOut && (
          <Suspense fallback={<div className={styles.modalLoading} />}>
            <SelectTokenModal
              visible={showOut}
              onClose={() => setShowOut(false)}
              onSelect={handleSelectOut}
              balanceMap={balanceMap}
            />
          </Suspense>
        )}

        {/* Settings modal */}
        <SwapSettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          slippage={slippage}
          setSlippage={setSlippage}
          speed={speed}
          setSpeed={setSpeed}
        />
      </div>

      {/* Info box on the right */}
      <div className={styles.infoBoxWrapper}>
        <SwapInfoBox
          rateLabel={rateLabel}
          feeLabel={`${(FEE_RATE * 100).toFixed(2)}% fee`}
          networkFeeLabel={networkFee}
          poolFeeLabel={`${(routeCount * 0.25).toFixed(2)}%`}
          priceImpactLabel={priceImpact}
          routeCount={routeCount}
          routerLabel="Raydium"
        />
      </div>

      {/* Status toast */}
      <SwapStatusModal
        status={swapStatus}
        txSignature={txSig}
        error={swapError}
      />
    </div>
  );
}
