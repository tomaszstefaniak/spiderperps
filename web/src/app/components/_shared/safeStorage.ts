// 'use client' not needed here; this runs both on server/client safely.
export type StorageLike = {
  getItem?: (k: string) => string | null;
  setItem?: (k: string, v: string) => void;
  removeItem?: (k: string) => void;
};

export function safeStorage(): StorageLike {
  if (typeof window === 'undefined') {
    // SSR: no-op shim
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  try {
    if (window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage;
    }
  } catch {}
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}
