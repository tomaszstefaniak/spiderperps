import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787";

export async function GET() {
  try {
    const r = await fetch(`${svc}/tokens`, { cache: "no-store" });
    const text = await r.text();
    let json: any; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!r.ok) return NextResponse.json({ error: json?.detail || json?.error || json }, { status: r.status });

    // Ensure USDC is present (HL may only return coin/USDC markets)
    const tokens: Array<{symbol: string; szDecimals?: number; pxDecimals?: number}> =
      Array.isArray(json.tokens) ? json.tokens : [];

    const hasUSDC = tokens.some(t => t.symbol?.toUpperCase() === "USDC");
    if (!hasUSDC) {
      tokens.unshift({ symbol: "USDC", szDecimals: 6, pxDecimals: 4 });
    }
    return NextResponse.json({ tokens });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "tokens failed" }, { status: 500 });
  }
}
