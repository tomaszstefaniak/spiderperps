// src/workers/searchWorker.ts
/// <reference lib="webworker" />
import Fuse from 'fuse.js';

export interface SearchToken {
  symbol: string;
  name: string;
  mint: string;
}

let fuse: Fuse<SearchToken>;

onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data as { type: string; payload: any };
  if (type === 'init') {
    // Initialize Fuse index once
    fuse = new Fuse(payload as SearchToken[], {
      keys: ['symbol', 'name', 'mint'],
      threshold: 0.3,
      ignoreLocation: true,
    });
    postMessage({ type: 'ready' });
  } else if (type === 'search') {
    const q = (payload as string).trim();
    if (!q) {
      postMessage({ type: 'results', payload: null });
    } else {
      const results = fuse.search(q, { limit: 100 }).map(r => r.item.mint);
      postMessage({ type: 'results', payload: results });
    }
  }
};
