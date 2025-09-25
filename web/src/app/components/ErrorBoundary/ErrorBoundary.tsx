// src/components/ErrorBoundary/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@utils/config';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Error caught by ErrorBoundary:', error, errorInfo);
    if (this.props.onError) this.props.onError(error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-content">
            <h2>Something went wrong</h2>
            <p>The application has encountered an unexpected error.</p>
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="error-details">{this.state.error.toString()}</div>
            )}
            <button className="error-boundary-button" onClick={() => window.location.reload()}>
              Refresh the page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
