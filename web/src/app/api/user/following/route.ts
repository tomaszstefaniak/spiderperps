import { NextResponse } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const user = searchParams.get("user");

    if (!user) {
        return NextResponse.json({ error: "Missing user param" }, { status: 400 });
    }

    try {
        const r = await fetch(`${svc}/user/following?user=${user}`, { cache: "no-store" });
        const text = await r.text();
        let json: any;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
        if (!r.ok) return NextResponse.json({ error: json?.detail || json?.raw || "HL user following error" }, { status: r.status });
        return NextResponse.json(json);
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "user following failed" }, { status: 500 });
    }
}
