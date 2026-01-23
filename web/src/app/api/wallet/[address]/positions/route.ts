import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8787";

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
    const { address } = await params;

    if (!address) return NextResponse.json({ error: "No address param" }, { status: 400 });

    try {
        const r = await fetch(`${svc}/wallet/${address}/positions`, { cache: "no-store" });
        const text = await r.text();
        let json: any;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
        if (!r.ok) return NextResponse.json({ error: json?.detail || json?.raw || "HL positions error" }, { status: r.status });
        return NextResponse.json(json);
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "positions failed" }, { status: 500 });
    }
}
