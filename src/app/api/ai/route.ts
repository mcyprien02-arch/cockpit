import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "";

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 500 });
  }
  const body = await req.json();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-5-20251001", max_tokens: 1024, ...body }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });
  return NextResponse.json(data);
}
