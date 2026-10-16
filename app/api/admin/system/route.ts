import { NextResponse } from "next/server";
import { requireAdminApi } from "@/app/admin/_lib/api";
import { collectSystemStatus } from "@/app/admin/_lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/system —— 连通性与配置状态（密钥已脱敏） */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const status = await collectSystemStatus();
  return NextResponse.json(status);
}
