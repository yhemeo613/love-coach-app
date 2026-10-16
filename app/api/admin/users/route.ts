import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetDailyQuota } from "@/lib/redis";
import { invalidateAdminCache, readQueryParams, requireAdminApi } from "@/app/admin/_lib/api";
import { clientIpOf, writeAudit } from "@/app/admin/_lib/audit";
import { humanRole } from "@/app/admin/_lib/format";
import { listUsers } from "@/app/admin/_lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["set-role", "ban", "unban", "reset-quota"] as const;
type AdminUserAction = (typeof ACTIONS)[number];

const ROLES = ["admin", "user"] as const;
type AdminRole = (typeof ROLES)[number];

interface PatchBody {
  userId?: unknown;
  action?: unknown;
  role?: unknown;
  reason?: unknown;
  days?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** GET /api/admin/users?q=&page= —— 分页用户列表（含会话数与今日用量） */
export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { q, page } = readQueryParams(request);
  const data = await listUsers(q, page);
  return NextResponse.json(data);
}

/**
 * PATCH /api/admin/users
 * body: { userId, action: "set-role" | "ban" | "unban" | "reset-quota", role?, reason?, days? }
 */
export async function PATCH(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return badRequest("请求体不是合法的 JSON。");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return badRequest("缺少 userId。");

  const action = typeof body.action === "string" ? (body.action as AdminUserAction) : null;
  if (!action || !ACTIONS.includes(action)) {
    return badRequest(`action 必须是 ${ACTIONS.join(" / ")} 之一。`);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, banned: true },
  });
  if (!target) {
    return NextResponse.json({ error: "目标用户不存在。" }, { status: 404 });
  }

  const ip = clientIpOf(request);
  const targetLabel = `「${target.name}（${target.email}）」`;
  const self = target.id === actor.id;

  switch (action) {
    case "set-role": {
      const role = typeof body.role === "string" ? (body.role as AdminRole) : null;
      if (!role || !ROLES.includes(role)) {
        return badRequest("role 必须是 admin 或 user。");
      }
      if (self && role === "user") {
        return badRequest("不能取消自己的管理员权限。");
      }
      const currentRole = target.role ?? "user";
      if (currentRole === role) {
        return NextResponse.json({ ok: true, message: `该用户已经是${humanRole(role)}，无需调整。` });
      }

      await prisma.user.update({ where: { id: userId }, data: { role } });
      await writeAudit({
        actorId: actor.id,
        action: "user.set-role",
        targetId: userId,
        detail: `将用户${targetLabel}的角色从${humanRole(currentRole)}调整为${humanRole(role)}`,
        ip,
      });
      await invalidateAdminCache();
      return NextResponse.json({ ok: true, message: `已将用户${targetLabel}设为${humanRole(role)}。` });
    }

    case "ban": {
      if (self) {
        return badRequest("不能封禁自己。");
      }
      const rawReason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
      const reason = rawReason.length > 0 ? rawReason : "未填写原因";
      const rawDays =
        typeof body.days === "number" && Number.isFinite(body.days) ? Math.floor(body.days) : 0;
      // 上限 10 年，避免异常入参把 banExpires 撑到 Postgres 时间范围之外
      const days = Math.min(3650, Math.max(0, rawDays));
      const banExpires = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

      await prisma.user.update({
        where: { id: userId },
        data: { banned: true, banReason: reason, banExpires },
      });
      await writeAudit({
        actorId: actor.id,
        action: "user.ban",
        targetId: userId,
        detail: `封禁用户${targetLabel}；原因：${reason}；期限：${days > 0 ? `${days} 天` : "永久"}`,
        ip,
      });
      await invalidateAdminCache();
      return NextResponse.json({
        ok: true,
        message: days > 0 ? `已封禁用户${targetLabel}，${days} 天后自动解封。` : `已永久封禁用户${targetLabel}。`,
      });
    }

    case "unban": {
      if (!target.banned) {
        return NextResponse.json({ ok: true, message: `用户${targetLabel}当前未被封禁。` });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { banned: false, banReason: null, banExpires: null },
      });
      await writeAudit({
        actorId: actor.id,
        action: "user.unban",
        targetId: userId,
        detail: `解除用户${targetLabel}的封禁`,
        ip,
      });
      await invalidateAdminCache();
      return NextResponse.json({ ok: true, message: `已解封用户${targetLabel}。` });
    }

    case "reset-quota": {
      await resetDailyQuota(userId);
      await writeAudit({
        actorId: actor.id,
        action: "user.reset-quota",
        targetId: userId,
        detail: `重置用户${targetLabel}的当日对话配额`,
        ip,
      });
      await invalidateAdminCache();
      return NextResponse.json({ ok: true, message: `已重置用户${targetLabel}的当日配额。` });
    }
  }

  // 类型上不可达：上面的 ACTIONS 校验已覆盖全部动作
  return badRequest("不支持的操作。");
}
