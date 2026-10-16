import { prisma } from "@/lib/prisma";

export interface UsagePayload {
  userId: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  toolCalls?: number;
  promptChars?: number;
  completionChars?: number;
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** 累加当日用量（按 userId + 日期 upsert），失败只记日志，不影响主流程 */
export async function recordUsage(payload: UsagePayload): Promise<void> {
  const day = today();
  const {
    userId,
    promptTokens = 0,
    completionTokens = 0,
    cachedTokens = 0,
    reasoningTokens = 0,
    toolCalls = 0,
    promptChars = 0,
    completionChars = 0,
  } = payload;

  try {
    await prisma.usageDaily.upsert({
      where: { userId_day: { userId, day } },
      create: {
        userId,
        day,
        requests: 1,
        promptTokens,
        completionTokens,
        cachedTokens,
        reasoningTokens,
        toolCalls,
        promptChars,
        completionChars,
      },
      update: {
        requests: { increment: 1 },
        promptTokens: { increment: promptTokens },
        completionTokens: { increment: completionTokens },
        cachedTokens: { increment: cachedTokens },
        reasoningTokens: { increment: reasoningTokens },
        toolCalls: { increment: toolCalls },
        promptChars: { increment: promptChars },
        completionChars: { increment: completionChars },
      },
    });
  } catch (error) {
    console.error("[usage] 写入失败", error);
  }
}

export interface UsageTotals {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  toolCalls: number;
  cacheHitRate: number;
}

/** 汇总某用户最近 N 天的用量，用于个人中心与后台 */
export async function getUsageTotals(userId: string, days = 7): Promise<UsageTotals> {
  const since = today();
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await prisma.usageDaily.findMany({
    where: { userId, day: { gte: since } },
    select: {
      requests: true,
      promptTokens: true,
      completionTokens: true,
      cachedTokens: true,
      reasoningTokens: true,
      toolCalls: true,
    },
  });

  const totals = rows.reduce(
    (acc, row) => ({
      requests: acc.requests + row.requests,
      promptTokens: acc.promptTokens + row.promptTokens,
      completionTokens: acc.completionTokens + row.completionTokens,
      cachedTokens: acc.cachedTokens + row.cachedTokens,
      reasoningTokens: acc.reasoningTokens + row.reasoningTokens,
      toolCalls: acc.toolCalls + row.toolCalls,
    }),
    {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      toolCalls: 0,
    },
  );

  return {
    ...totals,
    cacheHitRate:
      totals.promptTokens > 0 ? Number((totals.cachedTokens / totals.promptTokens).toFixed(4)) : 0,
  };
}
