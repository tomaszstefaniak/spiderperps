'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { createWalletClient, custom, type EIP1193Provider } from 'viem';

import styles from './link.module.css';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
type Network = 'mainnet' | 'testnet';
type Step = 'connect' | 'approve' | 'approving' | 'reporting' | 'done';

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const noopSubscribe = () => () => {};

/** Same page, opened inside MetaMask's in-app browser (MetaMask always uses https). */
function openInMetaMask() {
  const { host, pathname, search } = window.location;
  window.location.href = `https://metamask.app.link/dapp/${host}${pathname}${search}`;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One-time approval of a phone's agent key. The account's own wallet signs Hyperliquid's
 * `approveAgent` action here; the phone never sees that wallet, and this page never sees the
 * phone's key - only its public address.
 */
export default function LinkApproval() {
  const params = useSearchParams();
  const agent = params.get('agent') ?? '';
  const network = (params.get('network') ?? '') as Network;
  const name = params.get('name') ?? 'SpiderPerps';
  const valid = ADDRESS.test(agent) && (network === 'mainnet' || network === 'testnet') && name.length <= 16;

  // Wallet browsers inject window.ethereum before the page loads; the server render assumes none.
  const hasWallet = useSyncExternalStore(noopSubscribe, () => !!window.ethereum, () => false);
  const [step, setStep] = useState<Step>('connect');
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!valid) {
    return (
      <div className={styles.card}>
        <h1>Invalid link</h1>
        <p className={styles.muted}>Open this page from the &ldquo;Connect account&rdquo; screen in the SpiderPerps app.</p>
      </div>
    );
  }

  async function connect() {
    setError(null);
    if (!window.ethereum) {
      setError("No wallet found. Open this page in your wallet's browser (MetaMask, Rabby…) or a desktop browser with a wallet extension.");
      return;
    }
    try {
      const client = createWalletClient({ transport: custom(window.ethereum) });
      const [addr] = await client.requestAddresses();
      setAccount(addr);
      setStep('approve');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function approve() {
    if (!account || !window.ethereum) return;
    setError(null);
    setStep('approving');
    try {
      // Loaded on demand: keeps the SDK out of server rendering and the initial bundle.
      const { ExchangeClient, HttpTransport } = await import('@nktkas/hyperliquid');
      const wallet = createWalletClient({ account, transport: custom(window.ethereum) });
      const exchange = new ExchangeClient({ transport: new HttpTransport({ isTestnet: network === 'testnet' }), wallet });
      await exchange.approveAgent({ agentAddress: agent as `0x${string}`, agentName: name });
    } catch (e) {
      setStep('approve');
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    // Tell the copy service which account approved this phone. It double-checks with
    // Hyperliquid, which can take a few seconds to list a fresh approval.
    setStep('reporting');
    for (let i = 0; i < 15; i++) {
      const r = await fetch('/api/v1/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent, address: account, network }),
      }).catch(() => null);
      if (r?.ok) {
        setStep('done');
        return;
      }
      await sleep(2000);
    }
    setStep('approve');
    setError('Approved on Hyperliquid, but the app could not be notified. In the app, use "Already approved?" and enter your address.');
  }

  return (
    <div className={styles.card}>
      <h1>Approve your phone</h1>
      <p className={styles.muted}>
        The SpiderPerps app on your phone created a trading key. Approving it lets the phone place copy trades on your Hyperliquid{' '}
        {network} account after you confirm each one.
      </p>

      <dl className={styles.facts}>
        <dt>Phone key</dt>
        <dd className={styles.mono}>{short(agent)}</dd>
        <dt>Name</dt>
        <dd>{name}</dd>
        <dt>Network</dt>
        <dd className={network === 'testnet' ? styles.warn : styles.ok}>{network}</dd>
      </dl>

      <ul className={styles.list}>
        <li>✓ Can place and cancel orders</li>
        <li>✗ Can never withdraw or transfer your funds</li>
        <li>✓ Revocable any time in Hyperliquid → API</li>
      </ul>

      {step === 'connect' && hasWallet && (
        <button className={styles.primary} onClick={connect}>
          Connect wallet
        </button>
      )}
      {step === 'connect' && !hasWallet && (
        <>
          <button className={styles.primary} onClick={openInMetaMask}>
            Open in MetaMask
          </button>
          <p className={styles.muted}>
            This browser has no wallet. Open the page in your wallet app&apos;s browser, or on a computer with a wallet extension.
          </p>
        </>
      )}
      {(step === 'approve' || step === 'approving') && account && (
        <>
          <p className={styles.muted}>
            Signing as <span className={styles.mono}>{short(account)}</span>
          </p>
          <button className={styles.primary} onClick={approve} disabled={step === 'approving'}>
            {step === 'approving' ? 'Confirm in your wallet…' : 'Approve phone'}
          </button>
        </>
      )}
      {step === 'reporting' && <p className={styles.muted}>Approved. Letting the app know…</p>}
      {step === 'done' && (
        <div className={styles.done}>
          <strong>Done.</strong> Go back to the app; it signs in automatically.
        </div>
      )}
      {step === 'done' && (
        <a className={styles.primary} href="spiderperps://">
          Return to SpiderPerps
        </a>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
