import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "love-coach",
    model: process.env.LLM_MODEL || "deepseek-chat",
    base: process.env.LLM_API_BASE || "https://api.deepseek.com/v1",
    llmConfigured: Boolean(process.env.LLM_API_KEY),
    time: new Date().toISOString(),
  });
}
