import { formatDateTime, formatNumber } from "@/app/admin/_lib/format";
import { getUsageTotals } from "@/lib/ai/usage";
import { prisma } from "@/lib/prisma";
import { getUsage } from "@/lib/redis";
import { sceneMap, type Scene } from "@/lib/scenes";

/**
 * 「用户画像」页的数据装配层（**只在服务端 import**，内部直连 prisma / redis）。
 *
 * 为什么放在 components 下：本页的写域只有
 *   app/admin/users/[id]/page.tsx、app/api/admin/users/[id]/route.ts、components/admin/user-profile/**
 * 页面（服务端组件）与 /api/admin/users/[id]（GET）共用这一份装配逻辑，
 * 避免两边各写一份 where 条件与口径。任何 "use client" 组件都不得 import 本文件。
 *
 * 口径约定（与 app/admin/_lib/queries.ts 保持一致）：
 *   - usage_daily 按 UTC 自然日切分，day 是 @db.Date（Prisma 读回 UTC 零点）；
 *   - 活跃时段分布按北京时间（UTC+8）小时聚合，Asia/Shanghai 无夏令时，直接 +8 取模即可；
 *   - 所有时间字段对外统一为 ISO 字符串，交给 formatDateTime 展示。
 */

/** 趋势窗口：近 30 天（含今天） */
const TREND_DAYS = 30;
/** 深度使用者的 7 天 token 阈值 */
const DEEP_TOKEN_THRESHOLD = 50_000;
/** 高频活跃的 7 天请求阈值 */
const HIGH_FREQ_THRESHOLD = 30;
/** 缓存命中的良好阈值（cachedTokens / promptTokens） */
const CACHE_GOOD_RATE = 0.4;
/** 场景集中度阈值 */
const SCENE_FOCUS_RATE = 0.4;
/** 工具调用活跃阈值 */
const TOOL_ACTIVE_THRESHOLD = 5;
/** 思考模式占比阈值（reasoningTokens / completionTokens） */
const REASONING_RATE = 0.3;
/** 守护场景 id（安全相关信号，见 lib/scenes.ts） */
const SUPPORT_SCENE_ID = "support";
/** 未记录 model 的归并键 */
const UNRECORDED_MODEL = "__unrecorded__";

/* ------------------------------------------------------------------
   对外类型
   ------------------------------------------------------------------ */

export interface UserProfileTrendPoint {
  /** YYYY-MM-DD（UTC） */
  day: string;
  /** 横轴短标签，如 10/16 */
  label: string;
  requests: number;
  tokens: number;
}

export interface UserProfileSceneSlice {
  sceneId: string;
  code: string;
  name: string;
  accent: Scene["accent"];
  count: number;
  /** 占该用户会话总数的百分比（取整） */
  percent: number;
}

export interface UserProfileModelRow {
  /** 原始 model 值，未记录时为 null */
  model: string | null;
  /** 展示名，未记录时为「未记录」 */
  label: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UserProfileConversationRow {
  id: string;
  title: string;
  sceneId: string;
  sceneName: string;
  sceneCode: string;
  messageCount: number;
  updatedAt: string;
}

export type UserProfileTagTone = "risk" | "warn" | "positive" | "neutral";
export type UserProfileTagDimension = "风险" | "频次" | "深度" | "偏好" | "成本" | "习惯" | "互动";

export interface UserProfileTag {
  id: string;
  dimension: UserProfileTagDimension;
  label: string;
  /** 判定依据：一句话数据说明 */
  reason: string;
  tone: UserProfileTagTone;
}

export interface UserProfileQuota {
  minuteUsed: number;
  dayUsed: number;
  minuteLimit: number;
  dayLimit: number;
}

export interface UserProfile {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    banned: boolean;
    banReason: string | null;
    banExpires: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** 最近活跃：该用户最近一条 message 或最近一次 session.createdAt */
  lastActiveAt: string | null;
  lastActiveSource: "消息" | "登录" | null;
  metrics: {
    conversations: number;
    messages: number;
    actionPlans: number;
    actionPlansDone: number;
    remindersPending: number;
    requests7: number;
    tokens7: number;
    promptTokens7: number;
    completionTokens7: number;
    cachedTokens7: number;
    reasoningTokens7: number;
    toolCalls7: number;
    cacheHitRate7: number;
    requests30: number;
    tokens30: number;
  };
  /** Redis 实时配额；Redis 不可用时为 null */
  quota: UserProfileQuota | null;
  trend: UserProfileTrendPoint[];
  scenes: UserProfileSceneSlice[];
  /** 24 项，索引即北京时间小时 */
  hours: number[];
  peakHour: { hour: number; count: number } | null;
  models: UserProfileModelRow[];
  recentConversations: UserProfileConversationRow[];
  supportConversationCount: number;
  tags: UserProfileTag[];
  generatedAt: string;
}

/* ------------------------------------------------------------------
   内部工具
   ------------------------------------------------------------------ */

function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 相对今天偏移若干天的 UTC 零点 */
function utcDayStart(offsetDays = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

/** 北京时间（UTC+8）小时，0–23 */
function beijingHourOf(date: Date): number {
  return (date.getUTCHours() + 8) % 24;
}

function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

interface SceneMeta {
  name: string;
  code: string;
  accent: Scene["accent"];
}

/** sceneId → 中文场景名与场景代号（沿用 queries.ts 的兜底策略） */
function sceneMetaOf(sceneId: string): SceneMeta {
  const scene = sceneMap[sceneId];
  if (!scene) return { name: "未知场景", code: sceneId || "—", accent: "slate" };
  return { name: scene.name, code: scene.code, accent: scene.accent };
}

/** Redis 异常不应该把画像页打挂（配额只是辅助信息） */
async function loadQuota(userId: string): Promise<UserProfileQuota | null> {
  try {
    const quota = await getUsage(userId);
    return {
      minuteUsed: quota.minuteUsed,
      dayUsed: quota.dayUsed,
      minuteLimit: quota.minuteLimit,
      dayLimit: quota.dayLimit,
    };
  } catch (error) {
    console.error("[admin] 读取 Redis 配额失败，画像页降级为不显示实时配额", error);
    return null;
  }
}

/** 相对时间描述（用于最近活跃的辅助文案） */
export function humanizedAgo(value: string | null): string {
  if (!value) return "暂无活跃记录";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "暂无活跃记录";
  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} 个月前`;
  return `${Math.floor(diffMonths / 12)} 年前`;
}

/* ------------------------------------------------------------------
   画像标签（纯规则计算，中文短语，无 emoji）
   ------------------------------------------------------------------ */

interface ProfileTagInput {
  requests7: number;
  requests30: number;
  tokens7: number;
  promptTokens7: number;
  completionTokens7: number;
  cachedTokens7: number;
  reasoningTokens7: number;
  toolCalls7: number;
  conversationCount: number;
  scenes: UserProfileSceneSlice[];
  supportConversationCount: number;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
}

/** 规则引擎：风险标签排在最前，其次频次 / 深度 / 偏好 / 成本 / 习惯 / 互动 */
export function buildProfileTags(input: ProfileTagInput): UserProfileTag[] {
  const tags: UserProfileTag[] = [];

  /* --- 风险 --- */
  if (input.supportConversationCount > 0) {
    tags.push({
      id: "risk-support",
      dimension: "风险",
      tone: "risk",
      label: "命中守护场景",
      reason: `存在 ${formatNumber(input.supportConversationCount)} 个 sceneId = support（被操控 / 被拉扯）的会话，属于安全相关信号，建议人工关注。`,
    });
  }
  if (input.banned) {
    tags.push({
      id: "risk-banned",
      dimension: "风险",
      tone: "risk",
      label: "已被封禁",
      reason: `账号 banned = true；原因：${input.banReason ?? "未记录"}；${
        input.banExpires ? `解封时间 ${formatDateTime(input.banExpires)}` : "永久封禁"
      }。`,
    });
  }

  /* --- 频次 --- */
  if (input.requests7 >= HIGH_FREQ_THRESHOLD) {
    tags.push({
      id: "freq-high",
      dimension: "频次",
      tone: "positive",
      label: "高频活跃",
      reason: `近 7 天发起 ${formatNumber(input.requests7)} 次请求，达到 ${HIGH_FREQ_THRESHOLD} 次阈值。`,
    });
  } else if (input.requests30 === 0) {
    tags.push({
      id: "freq-silent",
      dimension: "频次",
      tone: "warn",
      label: "沉默用户",
      reason: "近 30 天 0 次请求（usage_daily 无记录）。",
    });
  } else {
    tags.push({
      id: "freq-occasional",
      dimension: "频次",
      tone: "neutral",
      label: "偶尔使用",
      reason: `近 7 天发起 ${formatNumber(input.requests7)} 次请求，低于 ${HIGH_FREQ_THRESHOLD} 次阈值；近 30 天共 ${formatNumber(
        input.requests30,
      )} 次。`,
    });
  }

  /* --- 深度 --- */
  if (input.tokens7 >= DEEP_TOKEN_THRESHOLD) {
    tags.push({
      id: "depth-deep",
      dimension: "深度",
      tone: "positive",
      label: "深度使用者",
      reason: `近 7 天消耗 ${formatNumber(input.tokens7)} tokens（prompt ${formatNumber(
        input.promptTokens7,
      )} + completion ${formatNumber(input.completionTokens7)}），达到 5 万阈值。`,
    });
  } else {
    tags.push({
      id: "depth-light",
      dimension: "深度",
      tone: "neutral",
      label: "轻度使用",
      reason: `近 7 天消耗 ${formatNumber(input.tokens7)} tokens，低于 5 万阈值。`,
    });
  }

  /* --- 偏好 --- */
  if (input.conversationCount === 0) {
    tags.push({
      id: "pref-none",
      dimension: "偏好",
      tone: "neutral",
      label: "暂无场景偏好",
      reason: "该用户还没有创建任何会话，无法判断场景倾向。",
    });
  } else {
    const top = input.scenes[0];
    const share = top ? top.count / input.conversationCount : 0;
    if (top && share > SCENE_FOCUS_RATE) {
      tags.push({
        id: "pref-focus",
        dimension: "偏好",
        tone: "neutral",
        label: `场景集中在 ${top.name}`,
        reason: `「${top.code} ${top.name}」占 ${formatNumber(top.count)}/${formatNumber(
          input.conversationCount,
        )} 个会话（${percentOf(top.count, input.conversationCount)}%），超过 40%。`,
      });
    } else if (top) {
      tags.push({
        id: "pref-spread",
        dimension: "偏好",
        tone: "neutral",
        label: "场景分布较分散",
        reason: `占比最高的「${top.code} ${top.name}」只占 ${percentOf(
          top.count,
          input.conversationCount,
        )}%，未超过 40%。`,
      });
    }
  }

  /* --- 成本 --- */
  if (input.promptTokens7 > 0) {
    const rate = input.cachedTokens7 / input.promptTokens7;
    const percent = Math.round(rate * 1000) / 10;
    if (rate >= CACHE_GOOD_RATE) {
      tags.push({
        id: "cost-cache-good",
        dimension: "成本",
        tone: "positive",
        label: "缓存命中良好",
        reason: `近 7 天 cachedTokens ${formatNumber(input.cachedTokens7)} 占 promptTokens ${formatNumber(
          input.promptTokens7,
        )} 的 ${percent}%，达到 40% 阈值。`,
      });
    } else {
      tags.push({
        id: "cost-cache-low",
        dimension: "成本",
        tone: "warn",
        label: "缓存命中偏低",
        reason: `近 7 天 cachedTokens ${formatNumber(input.cachedTokens7)} 占 promptTokens ${formatNumber(
          input.promptTokens7,
        )} 的 ${percent}%，低于 40% 阈值。`,
      });
    }
  } else {
    tags.push({
      id: "cost-none",
      dimension: "成本",
      tone: "neutral",
      label: "近 7 天无 token 记录",
      reason: `近 7 天请求 ${formatNumber(input.requests7)} 次，但 usage_daily 的 promptTokens 为 0，无法评估缓存命中。`,
    });
  }

  /* --- 习惯 --- */
  if (input.reasoningTokens7 > 0) {
    const ratio = input.completionTokens7 > 0 ? input.reasoningTokens7 / input.completionTokens7 : 1;
    if (ratio >= REASONING_RATE) {
      tags.push({
        id: "habit-reasoning",
        dimension: "习惯",
        tone: "neutral",
        label: "偏好开启思考模式",
        reason:
          input.completionTokens7 > 0
            ? `近 7 天 reasoningTokens ${formatNumber(input.reasoningTokens7)} 占 completionTokens ${formatNumber(
                input.completionTokens7,
              )} 的 ${Math.round(ratio * 1000) / 10}%，达到 30% 阈值。`
            : `近 7 天存在 reasoningTokens ${formatNumber(input.reasoningTokens7)}，但 completionTokens 未记录。`,
      });
    }
  }

  /* --- 互动 --- */
  if (input.toolCalls7 >= TOOL_ACTIVE_THRESHOLD) {
    tags.push({
      id: "interaction-tools",
      dimension: "互动",
      tone: "positive",
      label: "善于使用工具",
      reason: `近 7 天工具调用 ${formatNumber(input.toolCalls7)} 次，达到 ${TOOL_ACTIVE_THRESHOLD} 次阈值。`,
    });
  }

  return tags;
}

/* ------------------------------------------------------------------
   主装配函数
   ------------------------------------------------------------------ */

export async function loadUserProfile(id: string): Promise<UserProfile | null> {
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      banned: true,
      banReason: true,
      banExpires: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) return null;

  const trendSince = utcDayStart(-(TREND_DAYS - 1));

  const [
    conversationCount,
    messageCount,
    actionPlanCount,
    actionPlanDoneCount,
    reminderPendingCount,
    latestMessage,
    latestSession,
    usageRows,
    sceneGroups,
    messageRows,
    recentConversations,
    usageWeek,
    quota,
  ] = await Promise.all([
    prisma.conversation.count({ where: { userId: id } }),
    prisma.message.count({ where: { conversation: { userId: id } } }),
    prisma.actionPlan.count({ where: { userId: id } }),
    prisma.actionPlan.count({ where: { userId: id, status: "done" } }),
    prisma.reminder.count({ where: { userId: id, status: "pending" } }),
    prisma.message.findFirst({
      where: { conversation: { userId: id } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.session.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.usageDaily.findMany({
      where: { userId: id, day: { gte: trendSince } },
      orderBy: { day: "asc" },
      select: {
        day: true,
        requests: true,
        promptTokens: true,
        completionTokens: true,
        cachedTokens: true,
        reasoningTokens: true,
        toolCalls: true,
      },
    }),
    prisma.conversation.groupBy({
      by: ["sceneId"],
      where: { userId: id },
      _count: { _all: true },
    }),
    // 活跃时段与模型分布共用这一份轻量投影（不取 content，避免把正文读进内存）
    prisma.message.findMany({
      where: { conversation: { userId: id } },
      select: { model: true, promptTokens: true, completionTokens: true, createdAt: true },
    }),
    prisma.conversation.findMany({
      where: { userId: id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        sceneId: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    getUsageTotals(id, 7),
    loadQuota(id),
  ]);

  /* --- 近 30 天趋势：缺失日期补 0 --- */
  const requestsByDay = new Map<string, number>();
  const tokensByDay = new Map<string, number>();
  let requests30 = 0;
  let tokens30 = 0;
  for (const row of usageRows) {
    const key = dayKeyOf(row.day);
    const tokens = row.promptTokens + row.completionTokens;
    requestsByDay.set(key, (requestsByDay.get(key) ?? 0) + row.requests);
    tokensByDay.set(key, (tokensByDay.get(key) ?? 0) + tokens);
    requests30 += row.requests;
    tokens30 += tokens;
  }

  const trend: UserProfileTrendPoint[] = Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = utcDayStart(index - (TREND_DAYS - 1));
    const key = dayKeyOf(date);
    return {
      day: key,
      label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
      requests: requestsByDay.get(key) ?? 0,
      tokens: tokensByDay.get(key) ?? 0,
    };
  });

  /* --- 场景分布 --- */
  const scenes: UserProfileSceneSlice[] = sceneGroups
    .map((group) => {
      const meta = sceneMetaOf(group.sceneId);
      return {
        sceneId: group.sceneId,
        code: meta.code,
        name: meta.name,
        accent: meta.accent,
        count: group._count._all,
        percent: percentOf(group._count._all, conversationCount),
      };
    })
    .sort((a, b) => b.count - a.count);

  const supportConversationCount =
    sceneGroups.find((group) => group.sceneId === SUPPORT_SCENE_ID)?._count._all ?? 0;

  /* --- 活跃时段（北京时间）与模型分布 --- */
  const hours = Array.from({ length: 24 }, () => 0);
  const modelBuckets = new Map<
    string,
    { messages: number; promptTokens: number; completionTokens: number }
  >();

  for (const row of messageRows) {
    hours[beijingHourOf(row.createdAt)] += 1;

    const key = row.model && row.model.trim().length > 0 ? row.model : UNRECORDED_MODEL;
    const bucket =
      modelBuckets.get(key) ?? { messages: 0, promptTokens: 0, completionTokens: 0 };
    bucket.messages += 1;
    bucket.promptTokens += row.promptTokens ?? 0;
    bucket.completionTokens += row.completionTokens ?? 0;
    modelBuckets.set(key, bucket);
  }

  const peakHour = messageCount > 0 ? peakOf(hours) : null;

  const models: UserProfileModelRow[] = Array.from(modelBuckets.entries())
    .map(([key, bucket]) => ({
      model: key === UNRECORDED_MODEL ? null : key,
      label: key === UNRECORDED_MODEL ? "未记录" : key,
      messages: bucket.messages,
      promptTokens: bucket.promptTokens,
      completionTokens: bucket.completionTokens,
      totalTokens: bucket.promptTokens + bucket.completionTokens,
    }))
    .sort((a, b) => b.messages - a.messages || b.totalTokens - a.totalTokens);

  /* --- 最近 10 条会话 --- */
  const recent: UserProfileConversationRow[] = recentConversations.map((row) => {
    const meta = sceneMetaOf(row.sceneId);
    return {
      id: row.id,
      title: row.title,
      sceneId: row.sceneId,
      sceneName: meta.name,
      sceneCode: meta.code,
      messageCount: row._count.messages,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  /* --- 最近活跃：消息优先，其次登录 --- */
  const messageAt = latestMessage?.createdAt ?? null;
  const sessionAt = latestSession?.createdAt ?? null;
  let lastActiveAt: string | null = null;
  let lastActiveSource: "消息" | "登录" | null = null;
  if (messageAt && sessionAt) {
    if (messageAt.getTime() >= sessionAt.getTime()) {
      lastActiveAt = messageAt.toISOString();
      lastActiveSource = "消息";
    } else {
      lastActiveAt = sessionAt.toISOString();
      lastActiveSource = "登录";
    }
  } else if (messageAt) {
    lastActiveAt = messageAt.toISOString();
    lastActiveSource = "消息";
  } else if (sessionAt) {
    lastActiveAt = sessionAt.toISOString();
    lastActiveSource = "登录";
  }

  const metrics: UserProfile["metrics"] = {
    conversations: conversationCount,
    messages: messageCount,
    actionPlans: actionPlanCount,
    actionPlansDone: actionPlanDoneCount,
    remindersPending: reminderPendingCount,
    requests7: usageWeek.requests,
    tokens7: usageWeek.promptTokens + usageWeek.completionTokens,
    promptTokens7: usageWeek.promptTokens,
    completionTokens7: usageWeek.completionTokens,
    cachedTokens7: usageWeek.cachedTokens,
    reasoningTokens7: usageWeek.reasoningTokens,
    toolCalls7: usageWeek.toolCalls,
    cacheHitRate7: usageWeek.cacheHitRate,
    requests30,
    tokens30,
  };

  const tags = buildProfileTags({
    requests7: metrics.requests7,
    requests30: metrics.requests30,
    tokens7: metrics.tokens7,
    promptTokens7: metrics.promptTokens7,
    completionTokens7: metrics.completionTokens7,
    cachedTokens7: metrics.cachedTokens7,
    reasoningTokens7: metrics.reasoningTokens7,
    toolCalls7: metrics.toolCalls7,
    conversationCount,
    scenes,
    supportConversationCount,
    banned: Boolean(user.banned),
    banReason: user.banReason ?? null,
    banExpires: user.banExpires ? user.banExpires.toISOString() : null,
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      role: user.role ?? "user",
      banned: Boolean(user.banned),
      banReason: user.banReason ?? null,
      banExpires: user.banExpires ? user.banExpires.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    lastActiveAt,
    lastActiveSource,
    metrics,
    quota,
    trend,
    scenes,
    hours,
    peakHour,
    models,
    recentConversations: recent,
    supportConversationCount,
    tags,
    generatedAt: new Date().toISOString(),
  };
}

/** 24 小时分布里的峰值时段（全为 0 时返回 null） */
function peakOf(hours: number[]): { hour: number; count: number } | null {
  let bestHour = 0;
  let bestCount = 0;
  for (let hour = 0; hour < hours.length; hour += 1) {
    if (hours[hour] > bestCount) {
      bestCount = hours[hour];
      bestHour = hour;
    }
  }
  return bestCount > 0 ? { hour: bestHour, count: bestCount } : null;
}
