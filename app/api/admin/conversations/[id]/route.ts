import { NextResponse } from "next/server";
import { requireAdminApi } from "@/app/admin/_lib/api";
import { getConversationDetail } from "@/app/admin/_lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/conversations/[id] —— 单会话详情与完整消息 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const conversation = await getConversationDetail(id);
  if (!conversation) {
    return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
  }

  return NextResponse.json(conversation);
}
