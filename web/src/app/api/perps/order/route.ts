// src/app/api/perps/order/route.ts
import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";
const who = process.env.NEXT_PUBLIC_HL_ACCOUNT || process.env.HL_ACCOUNT_ADDRESS || "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const log = (id: string, ...args: any[]) => console.log(`[perps:${id}]`, ...args);

function extractOrderIds(placed: any): number[] {
  if (Array.isArray(placed?.orderIds) && placed.orderIds.length) {
    return placed.orderIds.filter((x: any) => Number.isInteger(x));
  }
  const prov = placed?.provider || placed?.hl || placed;
  const statuses = prov?.response?.data?.statuses || prov?.data?.statuses || [];
  const out: number[] = [];
  for (const st of Array.isArray(statuses) ? statuses : []) {
    for (const k of ["filled", "resting", "placed", "order", "status"]) {
      const obj = st?.[k];
      if (obj && typeof obj === "object") {
        let oid = obj.oid ?? obj.orderId ?? obj.id;
        if (typeof oid === "string" && /^\d+$/.test(oid)) oid = Number(oid);
        if (Number.isInteger(oid)) out.push(oid);
      }
    }
    for (const k of ["oid", "orderId", "id"]) {
      let v = st?.[k];
      if (typeof v === "string" && /^\d+$/.test(v)) v = Number(v);
      if (Number.isInteger(v)) out.push(v);
    }
  }
  return [...new Set(out)];
}

function providerIndicatesImmediateFill(placed: any): boolean {
  const prov = placed?.provider || placed?.hl || placed;
  const statuses = prov?.response?.data?.statuses || prov?.data?.statuses || [];
  for (const st of Array.isArray(statuses) ? statuses : []) {
    for (const key of ["filled", "status", "order"]) {
      const obj = st?.[key];
      if (obj && typeof obj === "object") {
        if ("avgPx" in obj || "totalSz" in obj) return true;
      }
      if (typeof obj === "string" && obj.toLowerCase().includes("filled")) return true;
    }
    const s = (st?.status || st?.state || "");
    if (typeof s === "string" && s.toLowerCase().includes("filled")) return true;
  }
  return false;
}

function extractProviderError(placed: any): string | null {
  const prov = placed?.provider || placed?.hl || placed || {};
  const statuses = prov?.response?.data?.statuses || prov?.data?.statuses || [];
  for (const st of Array.isArray(statuses) ? statuses : []) {
    if (st?.error) return String(st.error);
    if (st?.err) return String(st.err);
    if (typeof st === "string" && st.toLowerCase().includes("error")) return st;
  }
  const top =
    placed?.error ||
    prov?.error ||
    prov?.response?.error ||
    prov?.message ||
    placed?.detail ||
    null;
  return top ? String(top) : null;
}

function looksLikeNonMatch(msg: string): boolean {
  const s = msg.toLowerCase();
  return (
    s.includes("could not immediately match") ||
    s.includes("no resting") ||
    s.includes("insufficient liquidity") ||
    s.includes("invalid size") ||
    s.includes("below min size") ||
    s.includes("size too small")
  );
}

export async function POST(req: Request) {
  const id = rid();

  try {
    const bodyIn = await req.json();
    // Basic sanity
    const size = Number(bodyIn?.size);
    const coin = String(bodyIn?.coin || "").toUpperCase();
    const side = String(bodyIn?.side || "buy").toLowerCase();

    if (!coin || !size || size <= 0 || (side !== "buy" && side !== "sell")) {
      return NextResponse.json({ error: "Invalid order params" }, { status: 400 });
    }

    const forward = { coin, side, size, slippage: bodyIn?.slippage ?? 0.01 };
    log(id, "placing", forward);

    // Call FastAPI /order/market
    const res = await fetch(`${svc}/order/market`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(forward),
    });

    const text = await res.text();
    let placed: any;
    try { placed = JSON.parse(text); } catch { placed = { raw: text }; }

    log(id, "provider http", res.status);
    log(id, "provider payload", JSON.stringify(placed).slice(0, 600));

    // If FastAPI itself failed, bubble up
    if (!res.ok) {
      const msg = placed?.error || placed?.detail || placed?.raw || `Order failed (HTTP ${res.status})`;
      return NextResponse.json({ error: msg, provider: placed }, { status: res.status });
    }

    // Map common provider-side “no immediate match / invalid size” to 409
    const provErr = extractProviderError(placed);
    if (provErr && looksLikeNonMatch(provErr)) {
      return NextResponse.json(
        { error: provErr, provider: placed },
        { status: 409 }
      );
    }

    const accepted =
      !!placed?.accepted ||
      placed?.status === "ok" ||
      placed?.provider?.status === "ok" ||
      placed?.hl?.status === "ok";

    const filled = providerIndicatesImmediateFill(placed);
    const orderIds = extractOrderIds(placed);

    // Optional quick poll by OIDs (only if we have a wallet configured)
    let hit = filled;
    if (!hit && who && orderIds.length) {
      for (let i = 0; i < 8; i++) {
        const s = await fetch(`${svc}/order-status?user=${who}&oids=${orderIds.join(",")}`, { cache: "no-store" });
        const j = await s.json();
        const ok = Array.isArray(j?.orders) && j.orders.some((o: any) => {
          const st = String(o?.raw?.order?.status || o?.raw?.status || "").toLowerCase();
          return st.includes("filled");
        });
        if (ok) { hit = true; break; }
        await sleep(500);
      }
    }

    return NextResponse.json({
      ok: true,
      accepted: !!accepted,
      filled: !!hit,
      orderIds,
      provider: placed,
    });
  } catch (e: any) {
    console.error(`[perps:${id}] fatal`, e);
    return NextResponse.json({ error: e?.message || "perps order failed" }, { status: 500 });
  }
}
