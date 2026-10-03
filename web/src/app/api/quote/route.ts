import { NextResponse } from "next/server";
const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";

export async function POST(req: Request) {
  try {
    const { inputSymbol, outputSymbol, amount, slippage } = await req.json();
    const aNum = Number(amount);

    if (!inputSymbol || !outputSymbol || !aNum || aNum <= 0) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }
    const inU = String(inputSymbol).toUpperCase();
    const outU = String(outputSymbol).toUpperCase();

    // MVP: only USDC<->COIN
    if (inU !== "USDC" && outU !== "USDC") {
      return NextResponse.json({ error: "Only USDC↔COIN supported" }, { status: 400 });
    }

    const isBuy = inU === "USDC";
    const coin = isBuy ? outU : inU;

    // Call HL /quote (your FastAPI expects: { coin, side, size })
    const r = await fetch(`${svc}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coin, side: isBuy ? "buy" : "sell", size: aNum, slippage }),
    });

    const text = await r.text();
    let j: any; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) return NextResponse.json({ error: j?.detail || j?.error || j }, { status: r.status });

    // Normalize to the simple shape the MVP UI already handled:
    // - if buy: output is coin amount (use outCoinQuantized || outCoin)
    // - if sell: output is usdcOut
    let outStr = "0";
    if (isBuy) outStr = j?.outCoinQuantized ?? j?.outCoin ?? j?.out ?? "0";
    else outStr = j?.usdcOut ?? j?.out ?? "0";

    return NextResponse.json({
      outRaw: String(outStr),      // plain string is fine for MVP
      routeCount: 1,
      priceImpact: "0.00%",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "quote failed" }, { status: 500 });
  }
}
