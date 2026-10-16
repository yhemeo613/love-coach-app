import os from "node:os";
import { prisma } from "@/lib/prisma";
import {
  activeUserCount,
  countKeys,
  getRateLimitStats,
  getRedisStats,
  pingRedis,
  LIMITS,
} from "@/lib/redis";
import { getBalance, listModels } from "@/lib/ai/models";

export interface OpsRuntime {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuCount: number;
  loadAvg: [number, number, number];
  uptimeSeconds: number;
  processUptimeSeconds: number;
  /** 进程内存（RSS），单位 MB */
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  /** 宿主机内存，单位 MB */
  hostTotalMb: number;
  hostFreeMb: number;
  hostUsedPercent: number;
  env: string;
}

export interface OpsPostgres {
  ok: boolean;
  latencyMs: number;
  version?: string;
  databaseSizeMb?: number;
  connectionsUsed?: number;
  connectionsMax?: number;
  activeQueries?: number;
  idleConnections?: number;
  /** 缓冲区命中率，越高越好（正常 > 0.99） */
  cacheHitRate?: number;
  committed?: number;
  rolledBack?: number;
  deadlocks?: number;
  /** 表大小 top 5 */
  tables: Array<{ name: string; sizeMb: number; rows: number }>;
  error?: string;
}

export interface OpsRequestPoint {
  day: string;
  label: string;
  requests: number;
  tokens: number;
  toolCalls: number;
  reasoningTokens: number;
}

export interface OpsOverview {
  runtime: OpsRuntime;
  postgres: OpsPostgres;
  redis: Awaited<ReturnType<typeof getRedisStats>>;
  redisKeys: { total: number; cache: number; rateLimit: number; active: number; session: number };
  rateLimitStats: Awaited<ReturnType<typeof getRateLimitStats>>;
  requests: {
    last14d: OpsRequestPoint[];
    totalRequests14d: number;
    totalTokens14d: number;
    toolCalls14d: number;
    reasoningTokens14d: number;
    cacheHitRate14d: number;
  };
  llm: {
    base: string;
    model: string;
    reachable: boolean;
    latencyMs: number;
    models: string[];
    balance: { available: boolean; currency: string; total: string } | null;
  };
  data: {
    users: number;
    conversations: number;
    messages: number;
    actionPlans: number;
    reminders: number;
    audits: number;
  };
  limits: { perMinute: number; perDay: number };
  activeUsers: number;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toMb(bytes: number): number {
  return round(bytes / 1024 / 1024, 1);
}

/** Postgres 运行指标：全部用只读系统视图，不依赖扩展 */
async function collectPostgres(): Promise<OpsPostgres> {
  const start = Date.now();
  try {
    const [versionRow] = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    const [sizeRow] = await prisma.$queryRaw<Array<{ size: bigint }>>`
      SELECT pg_database_size(current_database()) AS size
    `;
    const [connRow] = await prisma.$queryRaw<
      Array<{ used: bigint; max: number; active: bigint; idle: bigint }>
    >`
      SELECT
        (SELECT count(*) FROM pg_stat_activity) AS used,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') AS idle
    `;
    const [statRow] = await prisma.$queryRaw<
      Array<{
        blks_hit: bigint;
        blks_read: bigint;
        xact_commit: bigint;
        xact_rollback: bigint;
        deadlocks: bigint;
      }>
    >`
      SELECT blks_hit, blks_read, xact_commit, xact_rollback, deadlocks
      FROM pg_stat_database WHERE datname = current_database()
    `;
    const tables = await prisma.$queryRaw<
      Array<{ relname: string; size: bigint; rows: bigint }>
    >`
      SELECT c.relname,
             pg_total_relation_size(c.oid) AS size,
             COALESCE(s.n_live_tup, 0) AS rows
      FROM pg_class c
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 5
    `;

    const hit = Number(statRow?.blks_hit ?? 0);
    const read = Number(statRow?.blks_read ?? 0);

    return {
      ok: true,
      latencyMs: Date.now() - start,
      version: (versionRow?.version ?? "").split(" ").slice(0, 2).join(" "),
      databaseSizeMb: round(Number(sizeRow?.size ?? 0) / 1024 / 1024, 1),
      connectionsUsed: Number(connRow?.used ?? 0),
      connectionsMax: Number(connRow?.max ?? 0),
      activeQueries: Number(connRow?.active ?? 0),
      idleConnections: Number(connRow?.idle ?? 0),
      cacheHitRate: hit + read > 0 ? round(hit / (hit + read), 4) : 0,
      committed: Number(statRow?.xact_commit ?? 0),
      rolledBack: Number(statRow?.xact_rollback ?? 0),
      deadlocks: Number(statRow?.deadlocks ?? 0),
      tables: tables.map((row) => ({
        name: row.relname,
        sizeMb: round(Number(row.size) / 1024 / 1024, 2),
        rows: Number(row.rows),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      tables: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function utcDayStart(offsetDays = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

/** 汇总运维面板所需的全部指标 */
export async function getOpsOverview(): Promise<OpsOverview> {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const load = os.loadavg();
  const hostTotal = os.totalmem();
  const hostFree = os.freemem();

  const [
    postgres,
    redisStats,
    redisPing,
    rateLimitStats,
    activeUsers,
    usageRows,
    counts,
    modelList,
    balance,
  ] = await Promise.all([
    collectPostgres(),
    getRedisStats(),
    pingRedis(),
    getRateLimitStats(),
    activeUserCount(),
    prisma.usageDaily.groupBy({
      by: ["day"],
      where: { day: { gte: utcDayStart(-13) } },
      _sum: {
        requests: true,
        promptTokens: true,
        completionTokens: true,
        cachedTokens: true,
        reasoningTokens: true,
        toolCalls: true,
      },
    }),
    Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.actionPlan.count(),
      prisma.reminder.count(),
      prisma.auditLog.count(),
    ]),
    listModels(),
    getBalance(),
  ]);

  const llmStart = Date.now();
  let llmReachable = modelList.fromUpstream;
  if (!llmReachable) llmReachable = false;
  const llmLatency = Date.now() - llmStart;

  const usageMap = new Map(
    usageRows.map((row) => [
      row.day.toISOString().slice(0, 10),
      {
        requests: row._sum.requests ?? 0,
        tokens: (row._sum.promptTokens ?? 0) + (row._sum.completionTokens ?? 0),
        cached: row._sum.cachedTokens ?? 0,
        prompt: row._sum.promptTokens ?? 0,
        toolCalls: row._sum.toolCalls ?? 0,
        reasoning: row._sum.reasoningTokens ?? 0,
      },
    ]),
  );

  const last14d: OpsRequestPoint[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = utcDayStart(-i);
    const key = date.toISOString().slice(0, 10);
    const hit = usageMap.get(key);
    last14d.push({
      day: key,
      label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
      requests: hit?.requests ?? 0,
      tokens: hit?.tokens ?? 0,
      toolCalls: hit?.toolCalls ?? 0,
      reasoningTokens: hit?.reasoning ?? 0,
    });
  }

  const sum = (pick: (point: OpsRequestPoint) => number) =>
    last14d.reduce((total, point) => total + pick(point), 0);

  const totalPrompt = Array.from(usageMap.values()).reduce((total, row) => total + row.prompt, 0);
  const totalCached = Array.from(usageMap.values()).reduce((total, row) => total + row.cached, 0);

  const [userCount, conversationCount, messageCount, actionPlanCount, reminderCount, auditCount] = counts;

  return {
    runtime: {
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuCount: cpus.length,
      loadAvg: [round(load[0], 2), round(load[1], 2), round(load[2], 2)],
      uptimeSeconds: Math.round(os.uptime()),
      processUptimeSeconds: Math.round(process.uptime()),
      rssMb: toMb(mem.rss),
      heapUsedMb: toMb(mem.heapUsed),
      heapTotalMb: toMb(mem.heapTotal),
      hostTotalMb: toMb(hostTotal),
      hostFreeMb: toMb(hostFree),
      hostUsedPercent: round(((hostTotal - hostFree) / hostTotal) * 100, 1),
      env: process.env.NODE_ENV || "development",
    },
    postgres,
    redis: redisPing.ok ? redisStats : { ...redisStats, ok: false, error: redisPing.message },
    redisKeys: {
      total: await countKeys(""),
      cache: await countKeys("cache:"),
      rateLimit: await countKeys("rl:"),
      active: await countKeys("active:"),
      session: await countKeys("ba:"),
    },
    rateLimitStats,
    requests: {
      last14d,
      totalRequests14d: sum((p) => p.requests),
      totalTokens14d: sum((p) => p.tokens),
      toolCalls14d: sum((p) => p.toolCalls),
      reasoningTokens14d: sum((p) => p.reasoningTokens),
      cacheHitRate14d: totalPrompt > 0 ? round(totalCached / totalPrompt, 4) : 0,
    },
    llm: {
      base: process.env.LLM_API_BASE || "https://api.deepseek.com/v1",
      model: process.env.LLM_MODEL || "deepseek-flash",
      reachable: llmReachable,
      latencyMs: llmLatency,
      models: modelList.models.map((m) => m.id),
      balance,
    },
    data: {
      users: userCount,
      conversations: conversationCount,
      messages: messageCount,
      actionPlans: actionPlanCount,
      reminders: reminderCount,
      audits: auditCount,
    },
    limits: { perMinute: LIMITS.perMinute, perDay: LIMITS.perDay },
    activeUsers,
  };
}
