import { prisma } from "@/lib/prisma";

/**
 * 管理操作审计：写入失败只记日志，不影响主操作结果
 * （审计是旁路，不应该把一次成功的封禁变成 500）。
 */

export interface AuditInput {
  actorId: string;
  /** 动作代号，如 user.ban / user.unban / user.set-role / user.reset-quota */
  action: string;
  targetId?: string | null;
  /** 人类可读的中文描述 */
  detail: string;
  ip?: string | null;
}

/** 取 x-forwarded-for 的首段，回落 x-real-ip */
export function clientIpOf(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp ? realIp.trim() : null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetId: input.targetId ?? null,
        detail: input.detail,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error("[admin] 审计日志写入失败", error);
  }
}
