import { NextResponse } from "next/server";
import { requireAdminApi } from "@/app/admin/_lib/api";
import { loadUserProfile } from "@/components/admin/user-profile/profile-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/[id] —— 单个用户的画像数据（只读）
 *
 * 与页面共用 loadUserProfile()，因此返回结构与 /admin/users/[id] 渲染口径完全一致。
 * 只读接口不写审计日志（审计只记录有副作用的操作，如封禁 / 改角色 / 重置配额）。
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "缺少用户 id。" }, { status: 400 });
  }

  const profile = await loadUserProfile(id);
  if (!profile) {
    return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
  }

  return NextResponse.json(profile);
}
