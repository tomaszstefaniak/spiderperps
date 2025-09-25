import React, { useState, useEffect } from 'react'
import styles from './Header.module.css'
import { PublicKey } from '@solana/web3.js'
import SelectTokenModal from '../SelectTokenModal/SelectTokenModalSmart'
import {
  HELIUS_API_KEY,
  INITIAL_RPCS,
  BACKGROUND_IMAGES,
  DEFAULT_RPC,
} from '@utils/config'
import { CombinedTokenInfo, useAllTokens } from '@/app/context/TokenContext'

const mydexLogo = '/assets/logo/eth_logo_mini_white.svg'
const gearIcon = '/assets/images/gear-8.svg'

export type RPCEndpoint = {
  label: string
  url: string
  latency: number | null
}

type WalletType = {
  publicKey: PublicKey
  signTransaction: (tx: any) => Promise<any>
}

type HeaderProps = {
  wallet: WalletType | null
  setWallet: (w: WalletType | null) => void
  onConnectWallet: () => void
  background: string
  onChangeBackground: (bg: string) => void
  selectedRPC: string
  setSelectedRPC: (rpc: string) => void
}

async function measureLatency(rpcUrl: string): Promise<number> {
  const start = performance.now()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (rpcUrl.includes('helius')) {
      headers['Authorization'] = `Bearer ${HELIUS_API_KEY}`
    }
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestBlockhash',
        params: [],
      }),
    })
    await res.json()
    return performance.now() - start
  } catch {
    return Infinity
  }
}

const Header: React.FC<HeaderProps> = ({
  wallet,
  setWallet,
  onConnectWallet,
  background,
  onChangeBackground,
  selectedRPC,
  setSelectedRPC,
}) => {
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [showGearPopup, setShowGearPopup] = useState(false)
  const [walletInfoOpen, setWalletInfoOpen] = useState(false)
  const [customRPC, setCustomRPC] = useState('')
  const [rpcs, setRpcs] = useState<RPCEndpoint[]>(
    INITIAL_RPCS.map(rpc => ({ ...rpc, latency: null }))
  )

  // 🔎 token loading state from context
  const { tokens, loading: tokensLoading } = useAllTokens()

  useEffect(() => {
    if (!selectedRPC) setSelectedRPC(DEFAULT_RPC)
  }, [selectedRPC, setSelectedRPC])

  useEffect(() => {
    const measureAll = async () => {
      for (const rpc of INITIAL_RPCS) {
        const lat = await measureLatency(rpc.url)
        setRpcs(prev =>
          prev.map(x => (x.url === rpc.url ? { ...x, latency: lat } : x))
        )
      }
    }
    measureAll()
    const iv = setInterval(measureAll, 5000)
    return () => clearInterval(iv)
  }, [])

  const handleDisconnect = () => {
    setWallet(null)
    setWalletInfoOpen(false)
  }

  const handleSelectToken = (token: CombinedTokenInfo) => {
    console.log('Header selected token:', token.symbol)
    setShowTokenModal(false)
  }

  let shortAddr = ''
  if (wallet) {
    const a = wallet.publicKey.toBase58()
    shortAddr = `${a.slice(0, 2)}...${a.slice(-2)}`
  }

  return (
    <div className={styles.headerContainer}>
      {/* LEFT */}
      <div className={styles.headerLeft}>
        <img src={mydexLogo} alt="logo" className={styles.headerLogo} />
        <span className={styles.headerAppName}>mydex</span>
        <button className={styles.headerButton}>Spot</button>
      </div>

      {/* CENTER */}
      <div className={styles.headerCenter}>
        <div className={styles.headerSearchContainer}>
          <img
            src="/assets/loupe.svg"
            className={styles.headerSearchIcon}
            alt="Search"
          />
          <input
            className={styles.headerSearchInput}
            placeholder={tokensLoading ? 'Loading tokens…' : 'Search token or address'}
            readOnly
            onFocus={() => setShowTokenModal(true)}
            onClick={() => setShowTokenModal(true)}
            aria-label="Open token search"
            aria-busy={tokensLoading}
          />
          {tokensLoading && <span className={styles.searchSpinner} aria-hidden="true" />}
        </div>
      </div>

      {/* RIGHT */}
      <div className={styles.headerRight}>
        <button
          className={styles.headerButton}
          onClick={() => setShowGearPopup(v => !v)}
        >
          <img src={gearIcon} alt="settings" className={styles.headerGearIcon} />
        </button>

        {showGearPopup && (
          <div className={styles.headerGearPopupVertical}>
            <div className={styles.gearSection}>
              <strong>Background</strong>
              <div className={styles.headerBackgroundGrid}>
                {BACKGROUND_IMAGES.map((bg, i) => (
                  <div
                    key={i}
                    className={styles.headerBackgroundOption}
                    onClick={() => onChangeBackground(bg)}
                  >
                    <img
                      src={bg}
                      alt={`BG${i + 1}`}
                      className={styles.headerBackgroundOptionImage}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.gearSection}>
              <strong>Preferred Explorer</strong>
              <div className={styles.headerExplorerLabel}>Solscan</div>
            </div>

            <div className={styles.gearSection}>
              <strong>RPC Endpoint</strong>
              <div className={styles.headerRpcOptions}>
                {rpcs.map(rpc => (
                  <label key={rpc.url} className={styles.headerRpcLabel}>
                    <input
                      type="radio"
                      name="rpcEndpoint"
                      checked={selectedRPC === rpc.url}
                      onChange={() => setSelectedRPC(rpc.url)}
                    />
                    <span>
                      {rpc.label}{' '}
                      {rpc.latency !== null && rpc.latency !== Infinity
                        ? `(${rpc.latency.toFixed(0)}ms)`
                        : '(N/A)'}
                    </span>
                  </label>
                ))}

                <label className={styles.headerRpcLabel}>
                  <input
                    type="radio"
                    name="rpcEndpoint"
                    checked={selectedRPC === customRPC && !!customRPC}
                    onChange={() => customRPC && setSelectedRPC(customRPC)}
                  />
                  <span>Custom RPC:</span>
                </label>
                <div className={styles.headerCustomRpcRow}>
                  <input
                    className={styles.headerCustomRpcInput}
                    placeholder="https://your.custom.rpc/"
                    value={customRPC}
                    onChange={e => setCustomRPC(e.target.value)}
                  />
                  <button
                    className={styles.headerCustomRpcSave}
                    onClick={() => {
                      if (customRPC.trim()) {
                        setSelectedRPC(customRPC.trim())
                        setCustomRPC('')
                      }
                    }}
                  >
                    Save
                  </button>
                  <button
                    className={styles.cancelBtn}
                    onClick={() => setShowGearPopup(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!wallet ? (
          <button className={styles.headerButton} onClick={onConnectWallet}>
            Connect
          </button>
        ) : (
          <div className={styles.headerWalletContainer}>
            <button
              className={styles.headerWalletButton}
              onClick={() => setWalletInfoOpen(o => !o)}
            >
              <span className={styles.headerWalletAddress}>{shortAddr}</span>
              <span
                className={`${styles.headerWalletArrow} ${
                  walletInfoOpen ? styles.rotated : ''
                }`}
              >
                ▼
              </span>
            </button>
            {walletInfoOpen && (
              <div className={styles.headerWalletPopup}>
                <div className={styles.headerFullAddress}>
                  {wallet.publicKey.toBase58()}
                </div>
                <button
                  className={styles.headerDisconnectButton}
                  onClick={handleDisconnect}
                >
                  Disconnect Wallet
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* token picker (always openable; modal itself shows loading message while indexing) */}
      <SelectTokenModal
        visible={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onSelect={handleSelectToken}
        poolMints={undefined}
        rpcEndpoint={selectedRPC || DEFAULT_RPC}
        owner={wallet?.publicKey ?? null}
      />
    </div>
  )
}

export default Header
