// src/app/api/perps/order/route.ts
import { NextResponse } from 'next/server';

const svc = process.env.HL_SERVICE_URL || 'http://127.0.0.1:8787';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
function log(id: string, ...args: any[]) { console.log(`[perps:${id}]`, ...args); }

function extractOrderIds(placed: any): number[] {
  if (Array.isArray(placed?.orderIds)) return placed.orderIds.filter((x: any) => Number.isInteger(x));
  const prov = placed?.provider || placed?.hl || placed;
  const statuses = prov?.response?.data?.statuses || prov?.data?.statuses || [];
  const out: number[] = [];
  for (const st of Array.isArray(statuses) ? statuses : []) {
    for (const k of ['filled', 'resting', 'placed', 'order', 'status']) {
      let obj = st?.[k];
      if (obj && typeof obj === 'object') {
        let oid = obj?.oid ?? obj?.orderId ?? obj?.id;
        if (typeof oid === 'string' && /^\d+$/.test(oid)) oid = Number(oid);
        if (Number.isInteger(oid)) out.push(oid);
      }
    }
    for (const k of ['oid', 'orderId', 'id']) {
      let v = st?.[k];
      if (typeof v === 'string' && /^\d+$/.test(v)) v = Number(v);
      if (Number.isInteger(v)) out.push(v);
    }
  }
  return [...new Set(out)];
}

function providerIndicatesImmediateFill(placed: any): boolean {
  const prov = placed?.provider || placed?.hl || placed;
  const statuses = prov?.response?.data?.statuses || prov?.data?.statuses || [];
  for (const st of Array.isArray(statuses) ? statuses : []) {
    for (const key of ['filled', 'status', 'order']) {
      const obj = st?.[key];
      if (obj && typeof obj === 'object') {
        if ('avgPx' in obj || 'totalSz' in obj) return true;
      }
      if (typeof obj === 'string' && obj.toLowerCase().includes('filled')) return true;
    }
    const s = (st?.status || st?.state || '');
    if (typeof s === 'string' && s.toLowerCase().includes('filled')) return true;
  }
  return false;
}

export async function POST(req: Request) {
  const id = rid();
  try {
    const { coin, side, size, slippage = 0.01 } = await req.json();
    const aSize = Number(size);
    if (!coin || !aSize || aSize <= 0) {
      return NextResponse.json({ error: 'Invalid size' }, { status: 400 });
    }
    const body = { coin: String(coin).toUpperCase(), side: String(side || 'buy'), size: aSize, slippage };

    log(id, 'placing', body);
    const r = await fetch(`${svc}/order/market`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const txt = await r.text();
    const placed = (() => { try { return JSON.parse(txt); } catch { return { raw: txt.slice(0, 400) }; } })();
    log(id, 'provider http', r.status);
    log(id, 'provider payload', JSON.stringify(placed).slice(0, 500));

    if (!r.ok) {
      const msg = placed?.detail || placed?.error || placed?.raw || `HL error (HTTP ${r.status})`;
      return NextResponse.json({ error: msg }, { status: r.status });
    }

    const orderIds = extractOrderIds(placed);
    const accepted = Boolean(
      placed?.accepted || placed?.status === 'ok' || placed?.provider?.status === 'ok' || placed?.hl?.status === 'ok'
    );
    const filled = providerIndicatesImmediateFill(placed);

    // quick fill polling by oid if we have wallet configured
    const who = process.env.NEXT_PUBLIC_HL_ACCOUNT || process.env.HL_ACCOUNT_ADDRESS || '';
    let hit = filled;
    async function pollByIds(ids: number[]) {
      for (let i = 0; i < 8; i++) {
        const s = await fetch(`${svc}/order-status?user=${who}&oids=${ids.join(',')}`, { cache: 'no-store' });
        const j = await s.json();
        const ok = Array.isArray(j?.orders) && j.orders.some((o: any) => {
          const st = String(o?.raw?.order?.status || o?.raw?.status || '').toLowerCase();
          return st.includes('filled');
        });
        if (ok) return true;
        await sleep(500);
      }
      return false;
    }
    if (!hit && who && orderIds.length) hit = await pollByIds(orderIds);

    return NextResponse.json({ ok: true, accepted, filled: hit, orderIds });
  } catch (e: any) {
    console.error('[perps] fatal', e);
    return NextResponse.json({ error: e?.message || 'perps order failed' }, { status: 500 });
  }
}
