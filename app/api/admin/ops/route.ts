import { NextResponse } from "next/server";
import { getOpsOverview } from "@/app/admin/_lib/metrics";
import { requireAdminApi } from "@/app/admin/_lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/ops —— 运维指标（实时读取，不走缓存） */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const data = await getOpsOverview();
  return NextResponse.json(data);
}
