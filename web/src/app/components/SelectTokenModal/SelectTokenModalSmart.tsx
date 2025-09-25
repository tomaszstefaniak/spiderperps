'use client'

import { useMemo } from 'react'
import type { Connection, PublicKey } from '@solana/web3.js'
import { Connection as Web3Connection } from '@solana/web3.js'
import { useWalletBalances } from '@/hooks/useWalletBalances'
import SelectTokenModal from './SelectTokenModal'
import type { CombinedTokenInfo } from '@/app/context/TokenContext'

export default function SelectTokenModalSmart({
  visible,
  onClose,
  onSelect,
  poolMints,
  rpcEndpoint,
  owner,
}: {
  visible: boolean
  onClose(): void
  onSelect(t: CombinedTokenInfo): void
  poolMints?: Set<string>
  rpcEndpoint: string
  owner: PublicKey | null
}) {
  // memoize a Connection for the current RPC
  const connection: Connection | null = useMemo(() => {
    if (!rpcEndpoint) return null
    return new Web3Connection(rpcEndpoint, { commitment: 'confirmed' })
  }, [rpcEndpoint])

  // poll balances every 60s
  const { balanceMap } = useWalletBalances(connection, owner, { refreshMs: 60_000 })

  return (
    <SelectTokenModal
      visible={visible}
      onClose={onClose}
      onSelect={onSelect}
      balanceMap={balanceMap}
      poolMints={poolMints}
    />
  )
}
