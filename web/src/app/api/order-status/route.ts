// src/app/api/order-status/route.ts
import { NextResponse } from "next/server";
const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = url.searchParams.get("user");
  const oids = url.searchParams.get("oids") || "";
  if (!user) return NextResponse.json({ error: "missing user" }, { status: 400 });

  const r = await fetch(`${svc}/order-status?user=${encodeURIComponent(user)}&oids=${encodeURIComponent(oids)}`, { cache: "no-store" });
  const text = await r.text();
  const j = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
  if (!r.ok) return NextResponse.json({ error: j?.detail || j?.error || j?.raw }, { status: r.status });
  return NextResponse.json(j);
}
