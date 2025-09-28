// src/lib/fetcher.ts
export async function jsonFetcher(input: RequestInfo | URL, init?: RequestInit) {
  const r = await fetch(input, init);
  const text = await r.text();
  let j: any;
  try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) {
    throw new Error(j?.error || j?.detail || j?.raw || `HTTP ${r.status}`);
  }
  return j;
}
