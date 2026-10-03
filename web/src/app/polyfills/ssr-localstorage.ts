// Ensure SSR never crashes if a weird global localStorage is injected.
if (typeof window === 'undefined') {
  const ls: any = (globalThis as any).localStorage;
  const broken =
    !ls ||
    typeof ls.getItem !== 'function' ||
    typeof ls.setItem !== 'function' ||
    typeof ls.removeItem !== 'function' ||
    typeof ls.clear !== 'function';

  if (broken) {
    (globalThis as any).localStorage = {
      getItem: (_k: string) => null,
      setItem: (_k: string, _v: string) => {},
      removeItem: (_k: string) => {},
      clear: () => {},
      key: (_i: number) => null,
      length: 0,
    };
  }
}
