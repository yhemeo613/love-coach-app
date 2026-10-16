import { prisma } from "@/lib/prisma";
import { FALLBACK_MODELS, getBalance, listModels } from "@/lib/ai/models";
import { getModelSettings } from "@/lib/model-settings";
import { cached } from "@/lib/redis";
import { defaultModel } from "@/lib/ai/provider";

export interface AdminModelRow {
  modelId: string;
  label: string;
  upstreamLabel: string;
  upstreamDescription: string;
  enabled: boolean;
  isDefault: boolean;
  note: string | null;
  /** 上游是否还提供该模型（false = 可能已下线 / 或本地自建模型） */
  upstreamAvailable: boolean;
  /** 近 7 天用量（来自 message 表，按模型聚合） */
  messages7d: number;
  tokens7d: number;
  conversations7d: number;
  avgChars: number;
}

export interface AdminModelsPayload {
  models: AdminModelRow[];
  defaultModelId: string;
  envDefaultModel: string;
  upstreamReachable: boolean;
  balance: { available: boolean; currency: string; total: string } | null;
  totals: {
    messages7d: number;
    tokens7d: number;
    cachedTokens7d: number;
    reasoningTokens7d: number;
    cacheHitRate: number;
  };
}

function since7Days(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * 模型管理数据：把「上游可用模型」「数据库里的开关」「真实用量」三份数据合到一起。
 * 走 30 秒缓存，避免每次开页面都扫 message 表。
 */
export async function getAdminModels(): Promise<AdminModelsPayload> {
  return cached("admin:models", 30, async () => {
    const since = since7Days();

    const [{ models: upstreamModels, fromUpstream }, settings, usageGroups, dailyTotals, balance] =
      await Promise.all([
        listModels(),
        getModelSettings(),
        prisma.message.groupBy({
          by: ["model"],
          where: { createdAt: { gte: since }, role: "assistant", model: { not: null } },
          _count: { _all: true },
          _sum: { promptTokens: true, completionTokens: true, charCount: true },
        }),
        // Prisma 7 不允许空 by 的 groupBy，这里用 aggregate
        prisma.usageDaily.aggregate({
          where: { day: { gte: since } },
          _sum: {
            requests: true,
            promptTokens: true,
            completionTokens: true,
            cachedTokens: true,
            reasoningTokens: true,
          },
        }),
        getBalance(),
      ]);

    // 会话数按模型统计：同一会话可能跨模型，这里按「该模型产生的消息所属会话」去重
    const conversationsByModel = await prisma.message.findMany({
      where: { createdAt: { gte: since }, role: "assistant", model: { not: null } },
      select: { model: true, conversationId: true },
      distinct: ["model", "conversationId"],
    });
    const conversationCount = new Map<string, number>();
    for (const row of conversationsByModel) {
      if (!row.model) continue;
      conversationCount.set(row.model, (conversationCount.get(row.model) ?? 0) + 1);
    }

    const usageMap = new Map(
      usageGroups.map((row) => [
        row.model ?? "",
        {
          messages: row._count._all,
          promptTokens: row._sum.promptTokens ?? 0,
          completionTokens: row._sum.completionTokens ?? 0,
          chars: row._sum.charCount ?? 0,
        },
      ]),
    );

    const settingMap = new Map(settings.map((row) => [row.modelId, row]));
    const upstreamIds = new Set(upstreamModels.map((m) => m.id));

    // 上游列表 + 数据库里出现过但上游没返回的（标记为不可用，便于发现下线模型）
    const allIds = Array.from(new Set([...upstreamModels.map((m) => m.id), ...settings.map((r) => r.modelId)]));

    const models: AdminModelRow[] = allIds.map((modelId) => {
      const upstream = upstreamModels.find((m) => m.id === modelId);
      const setting = settingMap.get(modelId);
      const usage = usageMap.get(modelId);
      const messages = usage?.messages ?? 0;
      const tokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

      return {
        modelId,
        label: setting?.label || upstream?.label || modelId,
        upstreamLabel: upstream?.label || "（上游未返回）",
        upstreamDescription: upstream?.description || "",
        enabled: setting?.enabled ?? true,
        isDefault: setting?.isDefault ?? false,
        note: setting?.note ?? null,
        upstreamAvailable: upstreamIds.has(modelId),
        messages7d: messages,
        tokens7d: tokens,
        conversations7d: conversationCount.get(modelId) ?? 0,
        avgChars: messages > 0 ? Math.round((usage?.chars ?? 0) / messages) : 0,
      };
    });

    const totals = dailyTotals._sum ?? {};
    const promptTokens = totals.promptTokens ?? 0;
    const cachedTokens = totals.cachedTokens ?? 0;

    const dbDefault = settings.find((row) => row.isDefault && row.enabled);

    return {
      models,
      defaultModelId: dbDefault?.modelId ?? defaultModel(),
      envDefaultModel: defaultModel(),
      upstreamReachable: fromUpstream,
      balance,
      totals: {
        messages7d: usageGroups.reduce((sum, row) => sum + row._count._all, 0),
        tokens7d: promptTokens + (totals.completionTokens ?? 0),
        cachedTokens7d: cachedTokens,
        reasoningTokens7d: totals.reasoningTokens ?? 0,
        cacheHitRate: promptTokens > 0 ? Number((cachedTokens / promptTokens).toFixed(4)) : 0,
      },
    };
  });
}

/** 上游不可用时的兜底清单，供后台至少能显示已知模型 */
export function fallbackModelIds(): string[] {
  return FALLBACK_MODELS.map((model) => model.id);
}
