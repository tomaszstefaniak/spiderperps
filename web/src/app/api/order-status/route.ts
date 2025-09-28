import { NextResponse } from "next/server";

const SVC = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "missing orderId" }, { status: 400 });
  }

  // Try a couple of common shapes for status endpoints
  const candidates = [
    `${SVC}/order/status?orderId=${encodeURIComponent(orderId)}`,
    `${SVC}/order/${encodeURIComponent(orderId)}`,
  ];

  for (const u of candidates) {
    try {
      const r = await fetch(u, { method: "GET" });
      const text = await r.text();
      const j = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();

      if (!r.ok) continue;

      // Normalize a few common shapes
      const status =
        j?.status ||
        j?.order?.status ||
        (j?.filled ? "filled" : j?.open ? "open" : undefined) ||
        "unknown";

      return NextResponse.json({
        ok: true,
        status: String(status).toLowerCase(),
        filledSize: j?.filled ?? j?.order?.filled ?? 0,
        provider: j,
      });
    } catch {
      // try next candidate
    }
  }

  return NextResponse.json({ ok: false, status: "unknown" }, { status: 200 });
}
