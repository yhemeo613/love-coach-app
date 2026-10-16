import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { activeUserCount, cached } from "@/lib/redis";
import { sceneMap, type Scene } from "@/lib/scenes";

/**
 * 后台只读查询的统一入口。
 * 页面（服务端组件）与 /api/admin/** 接口共用这里的函数，避免两边各写一份 where 条件。
 *
 * 时间口径：与 lib/redis.ts 的每日配额（new Date().toISOString().slice(0,10)）保持一致，
 * 按 UTC 自然日切分。usage_daily.day 是 @db.Date，Prisma 读回来是 UTC 零点的 Date。
 */

/** 列表统一每页 20 条 */
export const PAGE_SIZE = 20;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

const SEARCH_MAX_LENGTH = 120;

/** 解析 ?q=（去空格、限长；Next 15 的 searchParams 值可能是数组） */
export function readSearchParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
}

/** 解析 ?page=（非法值回落到第 1 页） */
export function readPageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function pageCountOf(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Date → YYYY-MM-DD（UTC） */
export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 今天（UTC）的 YYYY-MM-DD */
export function todayKeyOf(): string {
  return dayKeyOf(new Date());
}

/** 相对今天偏移若干天的 UTC 零点 */
function utcDayStart(offsetDays = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

/* ------------------------------------------------------------------
   用户列表
   ------------------------------------------------------------------ */

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  conversationCount: number;
  requestsToday: number;
}

export async function listUsers(q: string, page: number): Promise<Paged<AdminUserRow> & { q: string }> {
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const total = await prisma.user.count({ where });
  const pageCount = pageCountOf(total);
  const safePage = Math.min(page, pageCount);

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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
      _count: { select: { conversations: true } },
    },
  });

  const ids = users.map((user) => user.id);
  // usage_daily.day 是 DATE 列：取「昨天零点」起的窗口（留一天时区余量），再在内存里按 UTC 日键取今天
  const usageRows =
    ids.length > 0
      ? await prisma.usageDaily.findMany({
          where: { userId: { in: ids }, day: { gte: utcDayStart(-1) } },
          select: { userId: true, day: true, requests: true },
        })
      : [];

  const today = todayKeyOf();
  const usageToday = new Map<string, number>();
  for (const row of usageRows) {
    if (dayKeyOf(row.day) === today) usageToday.set(row.userId, row.requests);
  }

  return {
    items: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      role: user.role ?? "user",
      banned: Boolean(user.banned),
      banReason: user.banReason ?? null,
      banExpires: user.banExpires ? user.banExpires.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      conversationCount: user._count.conversations,
      requestsToday: usageToday.get(user.id) ?? 0,
    })),
    total,
    page: safePage,
    pageCount,
    pageSize: PAGE_SIZE,
    q,
  };
}

/* ------------------------------------------------------------------
   会话列表与详情
   ------------------------------------------------------------------ */

export interface AdminConversationRow {
  id: string;
  title: string;
  sceneId: string;
  sceneName: string;
  sceneCode: string;
  sceneAccent: Scene["accent"];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

function sceneMetaOf(sceneId: string): { name: string; code: string; accent: Scene["accent"] } {
  const scene = sceneMap[sceneId];
  if (!scene) return { name: "未知场景", code: sceneId || "—", accent: "slate" };
  return { name: scene.name, code: scene.code, accent: scene.accent };
}

export async function listConversations(
  q: string,
  page: number,
): Promise<Paged<AdminConversationRow> & { q: string }> {
  const where: Prisma.ConversationWhereInput = q
    ? { title: { contains: q, mode: "insensitive" } }
    : {};

  const total = await prisma.conversation.count({ where });
  const pageCount = pageCountOf(total);
  const safePage = Math.min(page, pageCount);

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      sceneId: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { messages: true } },
    },
  });

  return {
    items: rows.map((row) => {
      const meta = sceneMetaOf(row.sceneId);
      return {
        id: row.id,
        title: row.title,
        sceneId: row.sceneId,
        sceneName: meta.name,
        sceneCode: meta.code,
        sceneAccent: meta.accent,
        messageCount: row._count.messages,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        user: {
          id: row.user.id,
          name: row.user.name,
          email: row.user.email,
          image: row.user.image ?? null,
        },
      };
    }),
    total,
    page: safePage,
    pageCount,
    pageSize: PAGE_SIZE,
    q,
  };
}

export interface AdminMessageRow {
  id: string;
  role: string;
  content: string;
  charCount: number;
  createdAt: string;
}

export interface AdminConversationDetail {
  id: string;
  title: string;
  sceneId: string;
  sceneName: string;
  sceneCode: string;
  sceneAccent: Scene["accent"];
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    banned: boolean;
  };
  messages: AdminMessageRow[];
  charTotal: number;
}

export async function getConversationDetail(id: string): Promise<AdminConversationDetail | null> {
  if (!id) return null;

  const row = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      sceneId: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, image: true, role: true, banned: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, charCount: true, createdAt: true },
      },
    },
  });

  if (!row) return null;
  const meta = sceneMetaOf(row.sceneId);

  return {
    id: row.id,
    title: row.title,
    sceneId: row.sceneId,
    sceneName: meta.name,
    sceneCode: meta.code,
    sceneAccent: meta.accent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      image: row.user.image ?? null,
      role: row.user.role ?? "user",
      banned: Boolean(row.user.banned),
    },
    messages: row.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      charCount: message.charCount,
      createdAt: message.createdAt.toISOString(),
    })),
    charTotal: row.messages.reduce((sum, message) => sum + message.charCount, 0),
  };
}

/* ------------------------------------------------------------------
   总览看板（走 cached 30 秒）
   ------------------------------------------------------------------ */

export interface OverviewTrendPoint {
  /** YYYY-MM-DD（UTC） */
  day: string;
  /** 图表横轴短标签，如 10/16 */
  label: string;
  requests: number;
  /** 当日 prompt + completion tokens */
  tokens: number;
}

export interface OverviewModelSlice {
  modelId: string;
  label: string;
  messages: number;
  tokens: number;
}

export interface OverviewSceneSlice {
  sceneId: string;
  code: string;
  name: string;
  accent: Scene["accent"];
  count: number;
}

export interface OverviewAuditRow {
  id: string;
  action: string;
  detail: string | null;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
  actorName: string;
}

export interface AdminOverview {
  userTotal: number;
  userNewIn7Days: number;
  activeUsers: number;
  conversationTotal: number;
  messageTotal: number;
  requestsToday: number;
  trend: OverviewTrendPoint[];
  scenes: OverviewSceneSlice[];
  models: OverviewModelSlice[];
  audits: OverviewAuditRow[];
  generatedAt: string;
}

const TREND_DAYS = 7;
const RECENT_AUDIT_LIMIT = 10;

async function loadOverview(): Promise<AdminOverview> {
  const newUserSince = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);
  // 多取两天：DATE 列与 timestamp 参数比较时时区可能吃掉一天，聚合结果再按日键裁剪
  const usageSince = utcDayStart(-(TREND_DAYS + 1));

  const [
    userTotal,
    userNewIn7Days,
    conversationTotal,
    messageTotal,
    usageGroups,
    sceneGroups,
    modelGroups,
    auditRows,
    activeUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: newUserSince } } }),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.usageDaily.groupBy({
      by: ["day"],
      where: { day: { gte: usageSince } },
      _sum: { requests: true, promptTokens: true, completionTokens: true },
    }),
    prisma.conversation.groupBy({ by: ["sceneId"], _count: { _all: true } }),
    // 模型占比：按 assistant 消息聚合，历史数据可能没有 model 字段
    prisma.message.groupBy({
      by: ["model"],
      where: { role: "assistant", createdAt: { gte: newUserSince } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    }),
    prisma.auditLog.findMany({
      take: RECENT_AUDIT_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        detail: true,
        targetId: true,
        ip: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    activeUserCount().catch(() => 0),
  ]);

  const requestsByDay = new Map<string, { requests: number; tokens: number }>();
  for (const group of usageGroups) {
    requestsByDay.set(dayKeyOf(group.day), {
      requests: group._sum.requests ?? 0,
      tokens: (group._sum.promptTokens ?? 0) + (group._sum.completionTokens ?? 0),
    });
  }

  const trend: OverviewTrendPoint[] = Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = utcDayStart(index - (TREND_DAYS - 1));
    const key = dayKeyOf(date);
    const hit = requestsByDay.get(key);
    return {
      day: key,
      label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
      requests: hit?.requests ?? 0,
      tokens: hit?.tokens ?? 0,
    };
  });

  const models: OverviewModelSlice[] = modelGroups
    .map((group) => ({
      modelId: group.model ?? "未记录",
      label: group.model ?? "未记录",
      messages: group._count._all,
      tokens: (group._sum.promptTokens ?? 0) + (group._sum.completionTokens ?? 0),
    }))
    .sort((a, b) => b.messages - a.messages);

  const scenes: OverviewSceneSlice[] = sceneGroups
    .map((group) => {
      const meta = sceneMetaOf(group.sceneId);
      return {
        sceneId: group.sceneId,
        code: meta.code,
        name: meta.name,
        accent: meta.accent,
        count: group._count._all,
      };
    })
    .sort((a, b) => b.count - a.count);

  const audits: OverviewAuditRow[] = auditRows.map((row) => ({
    id: row.id,
    action: row.action,
    detail: row.detail ?? null,
    targetId: row.targetId ?? null,
    ip: row.ip ?? null,
    createdAt: row.createdAt.toISOString(),
    actorName: row.actor?.name ?? "已注销账号",
  }));

  return {
    userTotal,
    userNewIn7Days,
    activeUsers,
    conversationTotal,
    messageTotal,
    requestsToday: requestsByDay.get(todayKeyOf())?.requests ?? 0,
    trend,
    scenes,
    models,
    audits,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 总览数据：优先读 Redis 缓存（30 秒），Redis 不可用时直接回源，
 * 避免缓存故障把整个后台看板打挂。
 */
export async function getAdminOverview(): Promise<AdminOverview> {
  try {
    return await cached<AdminOverview>("admin:overview", 30, loadOverview);
  } catch (error) {
    console.error("[admin] 总览缓存不可用，已回源查询", error);
    return loadOverview();
  }
}
