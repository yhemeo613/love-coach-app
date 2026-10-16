import { prisma } from "./prisma";
import { cached } from "./redis";
import { defaultModel as envDefaultModel } from "./ai/provider";

/**
 * 模型配置的唯一读取入口。
 * 后台改的是数据库，聊天链路按这里的结果决定「用哪个模型、能不能用」。
 */
export interface ModelSettingRow {
  modelId: string;
  label: string | null;
  note: string | null;
  enabled: boolean;
  isDefault: boolean;
}

const CACHE_KEY = "settings:models";

export async function getModelSettings(): Promise<ModelSettingRow[]> {
  return cached(CACHE_KEY, 30, async () => {
    const rows = await prisma.modelSetting.findMany({
      orderBy: [{ isDefault: "desc" }, { modelId: "asc" }],
      select: { modelId: true, label: true, note: true, enabled: true, isDefault: true },
    });
    return rows;
  });
}

/** 后台改动后调用，让聊天链路立刻读到新配置 */
export async function invalidateModelSettings(): Promise<void> {
  const { invalidate } = await import("./redis");
  await invalidate("settings:");
}

/**
 * 决定本次请求实际使用的模型：
 *   1. 请求指定的模型存在且启用 → 用它
 *   2. 否则用后台指定的默认模型（同样要求启用）
 *   3. 再否则回落到环境变量 LLM_MODEL
 * 返回值里的 source 用于日志与调试。
 */
export async function resolveModel(requested?: string): Promise<{ modelId: string; source: string }> {
  const fallback = envDefaultModel();

  try {
    const settings = await getModelSettings();
    if (settings.length === 0) {
      return { modelId: requested || fallback, source: "env" };
    }

    if (requested) {
      const hit = settings.find((row) => row.modelId === requested);
      if (hit?.enabled) return { modelId: hit.modelId, source: "requested" };
    }

    const dbDefault = settings.find((row) => row.isDefault && row.enabled);
    if (dbDefault) return { modelId: dbDefault.modelId, source: "db-default" };

    const firstEnabled = settings.find((row) => row.enabled);
    if (firstEnabled) return { modelId: firstEnabled.modelId, source: "first-enabled" };

    return { modelId: fallback, source: "env-fallback" };
  } catch {
    // 配置表不可用时不要阻断对话
    return { modelId: requested || fallback, source: "error-fallback" };
  }
}

/** 给前端用的「可选模型」列表：只返回启用的，并标出默认项 */
export async function listSelectableModels(): Promise<
  Array<{ modelId: string; label: string | null; isDefault: boolean }>
> {
  try {
    const settings = await getModelSettings();
    const enabled = settings.filter((row) => row.enabled);
    if (enabled.length === 0) {
      return [{ modelId: envDefaultModel(), label: null, isDefault: true }];
    }
    const hasDefault = enabled.some((row) => row.isDefault);
    return enabled.map((row, index) => ({
      modelId: row.modelId,
      label: row.label,
      isDefault: hasDefault ? row.isDefault : index === 0,
    }));
  } catch {
    return [{ modelId: envDefaultModel(), label: null, isDefault: true }];
  }
}
