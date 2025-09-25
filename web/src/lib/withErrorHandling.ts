// src/lib/withErrorHandling.ts
import { NextResponse } from 'next/server'
import {
  normalizeError,
  createError,
  getUserFriendlyErrorMessage,
  ErrorType
} from '@/utils/errorHandling'

/**
 * Wrap an async API handler so that all errors
 * become normalized, logged, and a uniform JSON
 * error response is returned.
 */
export async function safeApi(handler: () => Promise<any>) {
  try {
    const data = await handler()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const appErr = normalizeError(err)
    createError(appErr.type, appErr.message, { originalError: err })
    const status =
      appErr.type === ErrorType.UNKNOWN_ERROR
        ? 500
        : 502
    return NextResponse.json(
      { error: getUserFriendlyErrorMessage(appErr) },
      { status }
    )
  }
}
