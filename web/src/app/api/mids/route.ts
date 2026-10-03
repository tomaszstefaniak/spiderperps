import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";

export async function GET() {
  try {
    const r = await fetch(`${svc}/mids`, { cache: "no-store" });
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!r.ok) return NextResponse.json({ error: json?.detail || json?.raw || "HL mids error" }, { status: r.status });
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "mids failed" }, { status: 500 });
  }
}
