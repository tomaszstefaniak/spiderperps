// src/components/SwapStatusModal/SwapStatusModal.tsx
import React, { useLayoutEffect, useEffect, useState } from 'react'
import styles from './SwapStatusModal.module.css'

export type SwapStatus =
  | 'idle'
  | 'signing'
  | 'processing'
  | 'confirmed'
  | 'failed'

interface Props {
  status: SwapStatus
  txSignature?: string | null
  error?: string | null
}

const showing = new Set<SwapStatus>([
  'signing',
  'processing',
  'confirmed',
  'failed',
])

const EXIT_DURATION = 600

export default function SwapStatusModal({
  status,
  txSignature,
  error,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState<'enter' | 'exit'>('exit')
  const [displayStatus, setDisplayStatus] = useState<SwapStatus>('idle')

  // determine extra border class
  const statusClass =
    displayStatus === 'confirmed'
      ? styles.swapStatusModalSuccess
      : displayStatus === 'failed'
      ? styles.swapStatusModalError
      : ''

  // animate on status change
  useLayoutEffect(() => {
    if (!showing.has(status)) {
      if (visible) {
        setPhase('exit')
        const t = window.setTimeout(() => {
          setVisible(false)
          setDisplayStatus(status)
        }, EXIT_DURATION)
        return () => window.clearTimeout(t)
      }
      return
    }
    if (!visible) {
      setDisplayStatus(status)
      setVisible(true)
      // mount in exit, then next frame → enter
      requestAnimationFrame(() => setPhase('enter'))
      return
    }
    // already visible: exit old, then enter new
    setPhase('exit')
    const out = window.setTimeout(() => {
      setDisplayStatus(status)
      setPhase('enter')
    }, EXIT_DURATION)
    return () => window.clearTimeout(out)
  }, [status, visible])

  // auto-hide after confirmed/failed
  useEffect(() => {
    if (displayStatus === 'confirmed' || displayStatus === 'failed') {
      const hide = window.setTimeout(() => {
        setPhase('exit')
        const unmount = window.setTimeout(() => {
          setVisible(false)
        }, EXIT_DURATION)
        return () => window.clearTimeout(unmount)
      }, 8000)
      return () => window.clearTimeout(hide)
    }
  }, [displayStatus])

  if (!visible) return null

  let message: React.ReactNode
  switch (displayStatus) {
    case 'signing':
      message = 'Waiting for wallet to sign transaction…'
      break
    case 'processing':
      message = 'Processing transaction…'
      break
    case 'confirmed':
      message = (
        <>
          Transaction confirmed!{' '}
          {txSignature && (
            <a
              href={`https://solscan.io/tx/${txSignature}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Solscan
            </a>
          )}
        </>
      )
      break
    case 'failed':
      message = error || 'Transaction failed'
      break
    default:
      return null
  }

  // build up our class list
  const classList = [
    styles.swapStatusModal,
    phase === 'enter'
      ? styles.swapStatusModalEnter
      : styles.swapStatusModalExit,
    statusClass,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classList}>{message}</div>
}
