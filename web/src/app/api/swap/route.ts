// src/app/api/swap/route.ts
import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787"; // your FastAPI

// utility to sleep on server
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function POST(req: Request) {
  try {
    const { inputSymbol, outputSymbol, amount, slippage = 0.01 } = await req.json();

    const aNum = Number(amount);
    if (!inputSymbol || !outputSymbol || !aNum || aNum <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const inU = String(inputSymbol).toUpperCase();
    const outU = String(outputSymbol).toUpperCase();
    if (inU !== "USDC" && outU !== "USDC") {
      return NextResponse.json({ error: "Only USDC↔COIN supported in MVP" }, { status: 400 });
    }

    const isBuy = inU === "USDC";
    const body = isBuy
      ? { coin: outU, side: "buy", usdcIn: aNum, slippage }
      : { coin: inU,  side: "sell", size: aNum,   slippage };

    // 1) place order
    const r = await fetch(`${svc}/order/market`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    const placed = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();

    if (!r.ok) {
      const msg = placed?.detail || placed?.error || placed?.raw || `HL swap error (HTTP ${r.status})`;
      return NextResponse.json({ error: msg }, { status: r.status });
    }

    const orderIds: number[] = Array.isArray(placed?.orderIds) ? placed.orderIds : [];

    // 2) try a short server-side poll for fills (best-effort)
    //    We *don’t* block long — UI also handles "checking fill..." text.
    let filled = false;
    const who = process.env.NEXT_PUBLIC_HL_ACCOUNT || process.env.HL_ACCOUNT_ADDRESS || "";

    if (who && orderIds.length) {
      for (let i = 0; i < 6; i++) {
        try {
          const s = await fetch(`${svc}/order-status?user=${who}&oids=${orderIds.join(",")}`, { cache: "no-store" });
          const st = await s.json();
          // If provider returns raw statuses, check for "filled" marker
          const hit = Array.isArray(st?.orders) && st.orders.some((o: any) => {
            const raw = o?.raw;
            const status = raw?.order?.status || raw?.status;
            return String(status || "").toLowerCase().includes("filled");
          });
          if (hit) { filled = true; break; }
        } catch {}
        await sleep(500);
      }
    }

    return NextResponse.json({
      ok: true,
      accepted: !!placed?.accepted,
      filled,
      orderIds,
      note: (!orderIds.length ? "provider returned no id" : undefined),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "swap failed" }, { status: 500 });
  }
}
