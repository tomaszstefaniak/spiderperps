// src/components/ErrorBoundary/index.ts
import ErrorBoundary from './ErrorBoundary';

class WalletErrorBoundary extends ErrorBoundary {}
class TransactionErrorBoundary extends ErrorBoundary {}

export { ErrorBoundary, WalletErrorBoundary, TransactionErrorBoundary };
