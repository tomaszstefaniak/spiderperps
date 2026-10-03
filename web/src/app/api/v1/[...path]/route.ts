// Proxies /api/v1/* to the copy-trading API in hl-service (same-origin for the browser).
import { NextResponse, type NextRequest } from "next/server";

const svc = process.env.HL_SERVICE_URL || "http://127.0.0.1:8790";

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = `${svc}/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) headers.authorization = auth;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  if (hasBody) headers["content-type"] = "application/json";
  try {
    const r = await fetch(url, { method: req.method, headers, body: hasBody ? await req.text() : undefined, cache: "no-store" });
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: { "content-type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ detail: e instanceof Error ? e.message : "copy service unreachable" }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
