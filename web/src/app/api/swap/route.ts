import { NextResponse } from "next/server";

const SVC = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787";

type Req = {
  inputSymbol: string;
  outputSymbol: string;
  amount: number | string;
  slippage?: number; // may be 1 for 1% or 0.01 for 1%
};

function normSlip(s?: number) {
  if (!s || !isFinite(s)) return 0.01;           // default 1%
  return s > 1 ? s / 100 : s;                    // accept percent or fraction
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Req;
    const amount = Number(body.amount);
    const inU  = String(body.inputSymbol || "").toUpperCase();
    const outU = String(body.outputSymbol || "").toUpperCase();
    const slippage = normSlip(body.slippage);

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }
    if (inU !== "USDC" && outU !== "USDC") {
      return NextResponse.json({ ok: false, error: "Only USDC↔COIN supported in MVP" }, { status: 400 });
    }

    const isBuy = inU === "USDC";
    const payload = isBuy
      ? { coin: outU, side: "buy",  usdcIn: amount, slippage }
      : { coin: inU,  side: "sell", size:   amount, slippage };

    // 30s client timeout so we can return a nice JSON instead of 500
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);

    let resp: Response;
    try {
      resp = await fetch(`${SVC}/order/market`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }

    const text = await resp.text();
    const data = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();

    // Normalize all the ways an id might appear
    const id =
      data?.orderId ??
      data?.orderID ??
      data?.order_id ??
      data?.id ??
      data?.order?.id ??
      null;

    // 2xx → accepted (maybe without id)
    if (resp.ok) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        orderId: id || undefined,
        provider: data,
      });
    }

    // Upstream timeouts (map to a clean code so UI can show “Upstream timeout”)
    if (resp.status === 504 || resp.status === 408) {
      return NextResponse.json({
        ok: false,
        code: resp.status,
        error: "upstream_timeout",
        provider: data,
      }, { status: 200 });
    }

    // Other upstream error
    const msg = data?.detail || data?.error || data?.raw || `Provider error (HTTP ${resp.status})`;
    return NextResponse.json({ ok: false, code: resp.status, error: msg, provider: data }, { status: 200 });

  } catch (err: any) {
    // Abort == timeout at our edge
    const aborted = err?.name === "AbortError";
    if (aborted) {
      return NextResponse.json({ ok: false, error: "client_timeout" }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status: 200 });
  }
}
