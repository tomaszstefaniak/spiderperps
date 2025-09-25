/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import axios from 'axios';

import { API_URLS } from '@raydium-io/raydium-sdk-v2';
import { initRaydium } from './config';
import { FEE_WALLET, FEE_RATE } from '@utils/config';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  'ComputeBudget111111111111111111111111111111'
);

/* ───────── helpers ───────── */

async function programForMint(connection: any, mint: PublicKey) {
  const info = await connection.getAccountInfo(mint);
  const is22 = info?.owner?.equals?.(TOKEN_2022_PROGRAM_ID) ?? false;
  return is22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

async function buildFeeIxs(opts: {
  connection: any;
  wallet: PublicKey;
  mintStr: string;
  amount: number;
}) {
  const { connection, wallet, mintStr, amount } = opts;
  if (amount <= 0) return [] as TransactionInstruction[];

  // SOL → lamports transfer
  if (mintStr === WSOL_MINT) {
    return [
      SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: new PublicKey(FEE_WALLET),
        lamports: amount,
      }),
    ];
  }

  // SPL → transfer to fee wallet ATA (autocreate if missing)
  const mint = new PublicKey(mintStr);
  const prog = await programForMint(connection, mint);

  const fromATA = await getAssociatedTokenAddress(mint, wallet, false, prog);
  const feeOwner = new PublicKey(FEE_WALLET);
  const toATA = await getAssociatedTokenAddress(mint, feeOwner, false, prog);

  const ixs: TransactionInstruction[] = [];
  if (!(await connection.getAccountInfo(toATA))) {
    ixs.push(createAssociatedTokenAccountInstruction(wallet, toATA, feeOwner, mint, prog));
  }
  ixs.push(createTransferInstruction(fromATA, toATA, wallet, amount, [], prog));
  return ixs;
}

/* ───────── entry ───────── */

export async function ammSwapDirect(opts: {
  walletPubkey: PublicKey;
  signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  poolId: string;       
  amountIn: number;         
  minAmountOut: number;      
  slippageBps: number;   
  inputMint: string;
  outputMint: string;
  preInstructions?: TransactionInstruction[];
}) {
  const raydium = await initRaydium(opts.walletPubkey);
  return swapViaHttp({ ...opts, raydium });
}

/* ╭──────── unified HTTP swap with in-kind fee (single tx) ───────╮ */
async function swapViaHttp({
  walletPubkey,
  signTransaction,
  amountIn,
  slippageBps,
  inputMint,
  outputMint,
  preInstructions = [],
  raydium,
}: any) {
  const conn = raydium.connection;

  let cuPrice = '0';
  try {
    const { data } = await axios.get(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`);
    const suggested = data?.data?.default?.h;
    if (typeof suggested === 'number' && suggested > 0) cuPrice = String(suggested);
  } catch { /* keep 0 */ }

  // fee in input token
  const feeAmt = Math.floor(amountIn * FEE_RATE);
  let netIn = amountIn - feeAmt;

  const isInputSol  = inputMint  === WSOL_MINT;
  const isOutputSol = outputMint === WSOL_MINT;

  /* ---------- SOL reserve math (wrap/rent/safety) ---------- */
  if (isInputSol) {
    const lam = await conn.getBalance(walletPubkey, 'confirmed');
    const rentToken = await conn.getMinimumBalanceForRentExemption(165);

    let rentOut = 0;
    if (!isOutputSol) {
      const outMint = new PublicKey(outputMint);
      const outProg = await programForMint(conn, outMint);
      const outAta  = await getAssociatedTokenAddress(outMint, walletPubkey, false, outProg);
      if (!(await conn.getAccountInfo(outAta))) rentOut = rentToken;
    }

    const sigFee = 10_000;
    const prioPad = 600_000;
    const safety  = 400_000;
    const reserves = rentToken + rentOut + sigFee + prioPad + safety;

    const desired = Math.max(0, netIn) + feeAmt + reserves;
    if (desired > lam) {
      const maxNet = Math.max(0, lam - (feeAmt + reserves));
      netIn = maxNet;
    }
  }

  if (netIn <= 0) throw new Error('insufficient_after_reserve');

  // owner ATAs where needed
  const inputAccount = !isInputSol
    ? await (async () => {
        const mint = new PublicKey(inputMint);
        const prog = await programForMint(conn, mint);
        return getAssociatedTokenAddress(mint, walletPubkey, false, prog);
      })()
    : undefined;

  const outputAccount = !isOutputSol
    ? await (async () => {
        const mint = new PublicKey(outputMint);
        const prog = await programForMint(conn, mint);
        return getAssociatedTokenAddress(mint, walletPubkey, false, prog);
      })()
    : undefined;

  // quote for the net amount
  const { data: quote } = await axios.get(`${API_URLS.SWAP_HOST}/compute/swap-base-in`, {
    params: {
      inputMint,
      outputMint,
      amount: netIn,
      slippageBps,
      txVersion: 'LEGACY',
    },
  });
  if (!quote?.success) throw new Error(`quote_failed: ${JSON.stringify(quote)}`);

  const { data: txResp } = await axios.post(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
    swapResponse: quote,
    txVersion: 'LEGACY',
    wallet: walletPubkey.toBase58(),
    wrapSol: isInputSol,
    unwrapSol: isOutputSol,
    inputAccount:  inputAccount?.toBase58(),
    outputAccount: outputAccount?.toBase58(),
    computeUnitPriceMicroLamports: cuPrice,
  });
  if (!txResp?.success) throw new Error(`build_failed: ${JSON.stringify(txResp)}`);

  const raw = Array.isArray(txResp.data) ? txResp.data[0].transaction : txResp.data.transaction;
  const tx = Transaction.from(Buffer.from(raw, 'base64'));

  const userIxs =
    (preInstructions as TransactionInstruction[] | undefined)?.filter(
      (ix) => !ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)
    ) ?? [];

  const feeIxs = await buildFeeIxs({
    connection: conn,
    wallet: walletPubkey,
    mintStr: inputMint,
    amount: feeAmt,
  });

  if (isInputSol) {
    tx.instructions = [
      ...userIxs,
      ...tx.instructions, 
      ...feeIxs,      
    ];
  } else {
    tx.instructions = [
      ...userIxs,
      ...feeIxs,      
      ...tx.instructions, 
    ];
  }

  // finalize & send
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPubkey;

  const signed = await signTransaction(tx);
  const txid = await conn.sendRawTransaction((signed as Transaction).serialize(), {
    skipPreflight: true,
  });

  return { txid, blockhash, lastValidBlockHeight };
}
/* ╰────────────────────────────────────────────────────────╯ */