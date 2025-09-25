// src/hooks/useDebounce.ts
import { useState, useEffect, startTransition } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        setDebounced(value);
      });
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
