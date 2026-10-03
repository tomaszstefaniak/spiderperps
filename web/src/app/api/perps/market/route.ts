// src/app/api/perps/markets/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // avoid static optimization

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787";

export async function GET() {
  try {
    const r = await fetch(`${svc}/perps/markets`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { error: j?.detail || "markets error" },
        { status: r.status }
      );
    }
    return NextResponse.json(j);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "markets fetch failed" },
      { status: 500 }
    );
  }
}
