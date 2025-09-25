// src/components/hooks/useLoadingState.ts
import { useState, useCallback } from 'react';

export enum LoadingStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface LoadingState<T> {
  status: LoadingStatus;
  data: T | null;
  error: Error | null;
  timestamp: number;
}

export function useLoadingState<T>(initialData: T | null = null) {
  const [state, setState] = useState<LoadingState<T>>({
    status: LoadingStatus.IDLE,
    data: initialData,
    error: null,
    timestamp: Date.now(),
  });

  const setLoading = useCallback(() => {
    setState({
      status: LoadingStatus.LOADING,
      data: null,
      error: null,
      timestamp: Date.now(),
    });
  }, []);

  const setSuccess = useCallback((data: T) => {
    setState({
      status: LoadingStatus.SUCCESS,
      data,
      error: null,
      timestamp: Date.now(),
    });
  }, []);

  const setError = useCallback((error: Error) => {
    setState({
      status: LoadingStatus.ERROR,
      data: null,
      error,
      timestamp: Date.now(),
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      status: LoadingStatus.IDLE,
      data: initialData,
      error: null,
      timestamp: Date.now(),
    });
  }, [initialData]);

  const execute = useCallback(
    async (promise: Promise<T>) => {
      setLoading();
      try {
        const result = await promise;
        setSuccess(result);
        return result;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        setError(normalizedError);
        throw normalizedError;
      }
    },
    [setLoading, setSuccess, setError]
  );

  return {
    ...state,
    setLoading,
    setSuccess,
    setError,
    reset,
    execute,
    isLoading: state.status === LoadingStatus.LOADING,
    isIdle: state.status === LoadingStatus.IDLE,
    isError: state.status === LoadingStatus.ERROR,
    isSuccess: state.status === LoadingStatus.SUCCESS,
  };
}
