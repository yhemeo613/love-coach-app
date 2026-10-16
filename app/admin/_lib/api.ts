import { NextResponse } from "next/server";
import { invalidate } from "@/lib/redis";
import { getApiUser, type CurrentUser } from "@/lib/session";
import { readPageParam, readSearchParam } from "./queries";

/** /api/admin/** 的统一守卫：未登录 401，非管理员 403 */
export type AdminGuardResult =
  | { ok: true; actor: CurrentUser }
  | { ok: false; response: NextResponse };

export async function requireAdminApi(): Promise<AdminGuardResult> {
  const actor = await getApiUser();
  if (!actor) {
    return { ok: false, response: NextResponse.json({ error: "未登录。" }, { status: 401 }) };
  }
  if (actor.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "需要管理员权限。" }, { status: 403 }) };
  }
  return { ok: true, actor };
}

/** 管理操作后让总览缓存立即失效；Redis 异常不影响主操作结果 */
export async function invalidateAdminCache(): Promise<void> {
  try {
    await invalidate("admin:");
  } catch (error) {
    console.error("[admin] 缓存失效失败（总览最多 30 秒后自愈）", error);
  }
}

/** 读取搜索/分页参数（接口与页面共用同一套解析规则） */
export function readQueryParams(request: Request): { q: string; page: number } {
  const url = new URL(request.url);
  return {
    q: readSearchParam(url.searchParams.get("q") ?? undefined),
    page: readPageParam(url.searchParams.get("page") ?? undefined),
  };
}
