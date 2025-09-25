//src/utilts/errorHandling.ts
import { logger } from '@/utils/config';

export enum ErrorType {
  WALLET_CONNECTION_ERROR = 'wallet_connection_error',
  WALLET_SIGNATURE_REJECTED = 'wallet_signature_rejected',
  INSUFFICIENT_BALANCE = 'insufficient_balance',
  RPC_CONNECTION_ERROR = 'rpc_connection_error',
  TRANSACTION_FAILED = 'transaction_failed',
  QUOTE_FETCH_ERROR = 'quote_fetch_error',
  POOL_NOT_FOUND = 'pool_not_found',
  TOKEN_NOT_FOUND = 'token_not_found',
  UNKNOWN_ERROR = 'unknown_error',
}

export interface AppError {
  type: ErrorType;
  message: string;
  originalError?: any;
  data?: any;
}

export function createError(type: ErrorType, message: string, originalError?: any, data?: any): AppError {
  const error: AppError = { type, message, originalError, data };
  if (type !== ErrorType.WALLET_SIGNATURE_REJECTED) {
    logger.error(`[${type}] ${message}`, originalError, data);
  }
  return error;
}

export function normalizeError(error: any): AppError {
  if (error instanceof Error) {
    return {
      type: ErrorType.UNKNOWN_ERROR,
      message: error.message,
      originalError: error,
    };
  }
  
  if (typeof error === 'string') {
    return {
      type: ErrorType.UNKNOWN_ERROR,
      message: error,
      originalError: new Error(error),
    };
  }

  return {
    type: ErrorType.UNKNOWN_ERROR,
    message: 'An unknown error occurred',
    originalError: error,
  };
}

export function getUserFriendlyErrorMessage(error: AppError): string {
  switch (error.type) {
    case ErrorType.WALLET_CONNECTION_ERROR:
      return 'Wallet connection failed. Please try again.';
    case ErrorType.WALLET_SIGNATURE_REJECTED:
      return 'Transaction signature rejected. Please approve the transaction to continue.';
    case ErrorType.INSUFFICIENT_BALANCE:
      return 'Insufficient balance to complete this transaction.';
    case ErrorType.RPC_CONNECTION_ERROR:
      return 'Network connection error. Please check your internet connection.';
    case ErrorType.TRANSACTION_FAILED:
      return 'Transaction failed. Please try again.';
    case ErrorType.QUOTE_FETCH_ERROR:
      return 'Could not fetch swap quote. Please try again.';
    case ErrorType.POOL_NOT_FOUND:
      return 'Trading pool not found.';
    case ErrorType.TOKEN_NOT_FOUND:
      return 'Token not found in registry.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}
