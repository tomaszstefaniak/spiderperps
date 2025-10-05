import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787";
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Small helper to scope logs per request
function rid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function log(id: string, ...args: any[]) {
  console.log(`[swap:${id}]`, ...args);
}

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

type BalancesResp = any;
function extractSziForCoin(bal: BalancesResp, coin: string): number {
  try {
    if (bal?.assetPositions && Array.isArray(bal.assetPositions)) {
      for (const ap of bal.assetPositions) {
        const pos = ap?.position;
        const c = String(pos?.coin ?? "").toUpperCase();
        if (c === coin.toUpperCase()) {
          const szi = Number(pos?.szi ?? 0);
          return Number.isFinite(szi) ? szi : 0;
        }
      }
    }
  } catch {}
  return 0;
}

async function getBalances(): Promise<BalancesResp | null> {
  try {
    const r = await fetch(`${svc}/balances`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const id = rid();
  try {
    const { inputSymbol, outputSymbol, amount, slippage = 0.01 } = await req.json();
    const aNum = Number(amount);
    log(id, "incoming", { inputSymbol, outputSymbol, amount: aNum, slippage });

    if (!inputSymbol || !outputSymbol || !aNum || aNum <= 0) {
      log(id, "reject: invalid amount");
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const inU = String(inputSymbol).toUpperCase();
    const outU = String(outputSymbol).toUpperCase();
    if (inU !== "USDC" && outU !== "USDC") {
      log(id, "reject: non-USDC pair");
      return NextResponse.json({ error: "Only USDC↔COIN supported in MVP" }, { status: 400 });
    }

    const isBuy = inU === "USDC";
    const tradedCoin = isBuy ? outU : inU;

    // Build hl-service payload (buy prefers usdcIn)
    const body = isBuy
      ? { coin: tradedCoin, side: "buy", usdcIn: aNum, slippage }
      : { coin: tradedCoin, side: "sell", size: aNum, slippage };
    log(id, "placing", body);

    // Pre-position snapshot (perps user_state) to detect delta
    const preBal = await getBalances();
    const preSzi = extractSziForCoin(preBal, tradedCoin);
    log(id, "pre-position", { coin: tradedCoin, szi: preSzi });

    // 1) place order
    const r = await fetch(`${svc}/order/market`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    const placed = (() => { try { return JSON.parse(txt); } catch { return { raw: txt.slice(0, 400) }; } })();

    log(id, "provider http", r.status, r.statusText);
    log(id, "provider payload (snippet)", JSON.stringify(placed).slice(0, 800));

    if (!r.ok) {
      const msg = placed?.detail || placed?.error || placed?.raw || `HL swap error (HTTP ${r.status})`;
      log(id, "reject: provider error", msg);
      return NextResponse.json({ error: msg }, { status: r.status });
    }

    // If provider returned an explicit status error, surface it to UI
    const prov = placed?.provider || placed?.hl || placed;
    const statuses = prov?.response?.data?.statuses || prov?.data?.statuses || [];
    const statusErr = Array.isArray(statuses) ? statuses.find((s: any) => typeof s?.error === "string") : null;
    if (statusErr) {
      log(id, "provider status error", statusErr.error);
      return NextResponse.json({ error: `Provider error: ${statusErr.error}`, debugId: id }, { status: 400 });
    }

    const orderIds = extractOrderIds(placed);
    const accepted = Boolean(
      placed?.accepted ||
      placed?.status === "ok" ||
      placed?.hl?.status === "ok" ||
      placed?.provider?.status === "ok"
    );
    log(id, "parsed", { accepted, orderIds });

    // If provider already says filled, we’re done
    if (providerIndicatesImmediateFill(placed)) {
      log(id, "immediate fill detected by provider");
      return NextResponse.json({ ok: true, accepted, filled: true, orderIds, debugId: id });
    }

    // who we will poll for fills
    const who = process.env.NEXT_PUBLIC_HL_ACCOUNT || process.env.HL_ACCOUNT_ADDRESS || "";
    log(id, "who", who || "(empty)");

    if (!who) {
      log(id, "skip polling: no account address configured");
      return NextResponse.json({
        ok: true,
        accepted,
        filled: false,
        orderIds,
        note: (!orderIds.length
          ? "provider returned no id; also cannot poll fills (missing NEXT_PUBLIC_HL_ACCOUNT)"
          : "cannot poll fills (missing NEXT_PUBLIC_HL_ACCOUNT)"),
        debugId: id,
      });
    }

    // 2) polling helpers
    const pollByIds = async (ids: number[]) => {
      for (let i = 0; i < 10; i++) {
        const s = await fetch(`${svc}/order-status?user=${who}&oids=${ids.join(",")}`, { cache: "no-store" });
        const j = await s.json();
        const sts = (j?.orders || []).map((o: any) => o?.raw?.order?.status || o?.raw?.status || "");
        log(id, `pollByIds[${i}]`, { ids, statuses: sts });
        const hit = Array.isArray(j?.orders) && j.orders.some((o: any) => {
          const raw = o?.raw;
          const st = (raw?.order?.status || raw?.status || "").toLowerCase();
          return st.includes("filled");
        });
        if (hit) return true;
        await sleep(500);
      }
      return false;
    };

    const pollRecentFills = async () => {
      for (let i = 0; i < 10; i++) {
        try {
          const s = await fetch(`${svc}/order-status?user=${who}`, { cache: "no-store" });
          const j = await s.json();
          const fills = Array.isArray(j?.fills) ? j.fills : [];
          log(id, `recentFills[${i}]`, { count: fills.length });
          const now = Date.now();

          let hit = fills.some((f: any) => {
            const coin = String(f?.coin ?? f?.asset ?? "").toUpperCase();
            const t    = Number(f?.time ?? f?.timestamp ?? f?.t ?? 0);
            const tsMs = t < 1e12 ? t * 1000 : t;
            return now - tsMs < 25_000 && coin === tradedCoin;
          });
          if (!hit) {
            hit = fills.some((f: any) => {
              const t  = Number(f?.time ?? f?.timestamp ?? f?.t ?? 0);
              const ts = t < 1e12 ? t * 1000 : t;
              return now - ts < 8_000;
            });
          }
          if (hit) return true;
        } catch (e) {
          log(id, `recentFills error`, String(e));
        }
        await sleep(500);
      }
      return false;
    };

    const pollPositionDelta = async () => {
      for (let i = 0; i < 10; i++) {
        const bal = await getBalances();
        const cur = extractSziForCoin(bal, tradedCoin);
        const delta = cur - preSzi;
        log(id, `posDelta[${i}]`, { pre: preSzi, cur, delta, expect: isBuy ? ">0" : "<0" });
        if ((isBuy && delta > 0) || (!isBuy && delta < 0)) return true;
        await sleep(500);
      }
      return false;
    };

    // 3) try polls
    let filled = false;
    if (orderIds.length) filled = await pollByIds(orderIds);
    if (!filled) filled = await pollRecentFills();
    if (!filled) filled = await pollPositionDelta();

    log(id, "final", { accepted, orderIds, filled });

    return NextResponse.json({
      ok: true,
      accepted,
      filled,
      orderIds,
      note: (!orderIds.length ? "provider returned no id" : undefined),
      debugId: id,
    });
  } catch (e: any) {
    console.error(`[swap:${id}] fatal`, e);
    return NextResponse.json({ error: e?.message || "swap failed" }, { status: 500 });
  }
}
