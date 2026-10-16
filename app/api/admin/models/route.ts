import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminModels } from "@/app/admin/_lib/models";
import { invalidateAdminCache, readQueryParams, requireAdminApi } from "@/app/admin/_lib/api";
import { clientIpOf, writeAudit } from "@/app/admin/_lib/audit";
import { invalidateModelSettings } from "@/lib/model-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["enable", "disable", "set-default", "update-meta", "clear-default"] as const;
type ModelAction = (typeof ACTIONS)[number];

interface PatchBody {
  modelId?: unknown;
  action?: unknown;
  label?: unknown;
  note?: unknown;
}

/** GET /api/admin/models —— 模型清单 + 真实用量 + 余额 */
export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  readQueryParams(request); // 保持与其他接口一致（当前无过滤参数）
  const data = await getAdminModels();
  return NextResponse.json(data);
}

/**
 * PATCH /api/admin/models
 * body: { modelId, action: "enable"|"disable"|"set-default"|"clear-default"|"update-meta", label?, note? }
 */
export async function PATCH(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
  if (!modelId) return NextResponse.json({ error: "缺少 modelId。" }, { status: 400 });

  const action = typeof body.action === "string" ? (body.action as ModelAction) : null;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action 必须是 ${ACTIONS.join(" / ")} 之一。` }, { status: 400 });
  }

  const existing = await prisma.modelSetting.findUnique({ where: { modelId } });
  const ip = clientIpOf(request);

  const upsert = (data: {
    enabled?: boolean;
    isDefault?: boolean;
    label?: string | null;
    note?: string | null;
  }) =>
    prisma.modelSetting.upsert({
      where: { modelId },
      create: { modelId, enabled: data.enabled ?? true, isDefault: data.isDefault ?? false, label: data.label ?? null, note: data.note ?? null },
      update: data,
    });

  switch (action) {
    case "enable": {
      if (existing?.enabled) return NextResponse.json({ ok: true, message: "该模型已是启用状态。" });
      await upsert({ enabled: true });
      await writeAudit({
        actorId: actor.id,
        action: "model.enable",
        targetId: modelId,
        detail: `启用模型「${modelId}」，用户端将可选`,
        ip,
      });
      break;
    }

    case "disable": {
      if (existing && !existing.enabled) {
        return NextResponse.json({ ok: true, message: "该模型已是停用状态。" });
      }
      // 不允许停用「当前默认模型」，否则用户端无默认可选
      if (existing?.isDefault) {
        return NextResponse.json(
          { error: "该模型是当前默认模型，请先把默认模型切到其他模型，再停用它。" },
          { status: 400 },
        );
      }
      await upsert({ enabled: false });
      await writeAudit({
        actorId: actor.id,
        action: "model.disable",
        targetId: modelId,
        detail: `停用模型「${modelId}」，用户端不再可选；已保存的历史对话不受影响`,
        ip,
      });
      break;
    }

    case "set-default": {
      if (existing?.isDefault) return NextResponse.json({ ok: true, message: "该模型已是默认模型。" });
      if (existing && !existing.enabled) {
        return NextResponse.json({ error: "该模型已停用，无法设为默认。请先启用。" }, { status: 400 });
      }
      // 全局只能有一个默认：先清空，再设置（放在同一事务里）
      await prisma.$transaction([
        prisma.modelSetting.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
        prisma.modelSetting.upsert({
          where: { modelId },
          create: { modelId, enabled: true, isDefault: true },
          update: { isDefault: true, enabled: true },
        }),
      ]);
      await writeAudit({
        actorId: actor.id,
        action: "model.set-default",
        targetId: modelId,
        detail: `将默认模型切换为「${modelId}」`,
        ip,
      });
      break;
    }

    case "clear-default": {
      await prisma.modelSetting.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      await writeAudit({
        actorId: actor.id,
        action: "model.clear-default",
        targetId: modelId,
        detail: "清除数据库默认模型，回落到环境变量 LLM_MODEL",
        ip,
      });
      break;
    }

    case "update-meta": {
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 40) : null;
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;
      await upsert({ label: label || null, note: note || null });
      await writeAudit({
        actorId: actor.id,
        action: "model.update-meta",
        targetId: modelId,
        detail: `更新模型「${modelId}」的展示信息：名称「${label || "默认"}」${note ? `，备注「${note}」` : ""}`,
        ip,
      });
      break;
    }
  }

  await invalidateModelSettings();
  await invalidateAdminCache();

  return NextResponse.json({ ok: true, message: "已更新，用户端立即生效。" });
}
