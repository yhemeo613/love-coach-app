import { NextResponse } from "next/server";
import { readQueryParams, requireAdminApi } from "@/app/admin/_lib/api";
import { listConversations } from "@/app/admin/_lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/conversations?q=&page= —— 分页会话列表 */
export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { q, page } = readQueryParams(request);
  const data = await listConversations(q, page);
  return NextResponse.json(data);
}
