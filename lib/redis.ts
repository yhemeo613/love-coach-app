import Redis from "ioredis";

/**
 * Redis 承担四件事（都不是「可有可无」的装饰）：
 *   1. Better Auth 二级存储：会话/验证码/限流计数走内存级 KV，减少 Postgres 压力；
 *   2. 对话限流：每分钟窗口 + 每日配额，保护上游模型额度；
 *   3. 看板缓存：后台统计聚合结果缓存 30 秒，避免每次刷新都全表扫描；
 *   4. 在线/活跃标记：用于后台「当前在线」计数。
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

function createClient(): Redis {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    keyPrefix: "",
  });

  client.on("error", (error) => {
    // 连接失败不应该让整个进程崩溃，降级为日志
    console.error("[redis]", error.message);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/* ------------------------------------------------------------------
   应用级 Redis 工具
   ------------------------------------------------------------------ */

export const LIMITS = {
  /** 每用户每分钟最多发起的对话请求数 */
  perMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 12),
  /** 每用户每日最多发起的对话请求数 */
  perDay: Number(process.env.RATE_LIMIT_PER_DAY || 200),
};

export interface RateLimitResult {
  allowed: boolean;
  /** 触发限制时的提示文案 */
  reason?: string;
  minuteUsed: number;
  dayUsed: number;
  minuteRemaining: number;
  dayRemaining: number;
}

function minuteKey(userId: string): string {
  return `rl:min:${userId}:${Math.floor(Date.now() / 60000)}`;
}

function dayKey(userId: string): string {
  return `rl:day:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

/** 每个请求记两次数：分钟窗口与自然日配额 */
export async function checkAndConsumeRateLimit(userId: string): Promise<RateLimitResult> {
  const mKey = minuteKey(userId);
  const dKey = dayKey(userId);

  const [minuteUsed, dayUsed] = await redis
    .multi()
    .incr(mKey)
    .expire(mKey, 120)
    .incr(dKey)
    .expire(dKey, 60 * 60 * 36)
    .exec()
    .then((results) => [Number(results?.[0]?.[1] ?? 1), Number(results?.[2]?.[1] ?? 1)]);

  const allowedByMinute = minuteUsed <= LIMITS.perMinute;
  const allowedByDay = dayUsed <= LIMITS.perDay;

  return {
    allowed: allowedByMinute && allowedByDay,
    reason: !allowedByMinute
      ? `请求过于频繁，每分钟上限 ${LIMITS.perMinute} 次，请稍后再试。`
      : !allowedByDay
        ? `今日对话次数已达上限（${LIMITS.perDay} 次），明天再来。`
        : undefined,
    minuteUsed,
    dayUsed,
    minuteRemaining: Math.max(0, LIMITS.perMinute - minuteUsed),
    dayRemaining: Math.max(0, LIMITS.perDay - dayUsed),
  };
}

export async function getUsage(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [minuteUsed, dayUsed] = await Promise.all([
    redis.get(`rl:min:${userId}:${Math.floor(Date.now() / 60000)}`),
    redis.get(`rl:day:${userId}:${today}`),
  ]);
  return {
    minuteUsed: Number(minuteUsed || 0),
    dayUsed: Number(dayUsed || 0),
    minuteLimit: LIMITS.perMinute,
    dayLimit: LIMITS.perDay,
  };
}

/** 管理员重置某用户当日配额 */
export async function resetDailyQuota(userId: string): Promise<void> {
  await redis.del(`rl:day:${userId}:${new Date().toISOString().slice(0, 10)}`);
}

/* ---- 限流拒绝计数（运维分析用：能看到到底有多少请求被挡下） ---- */

function rejectDayKey(): string {
  return `rl:reject:${new Date().toISOString().slice(0, 10)}`;
}

export async function recordRateLimitRejection(
  userId: string,
  kind: "minute" | "day",
): Promise<void> {
  try {
    const key = rejectDayKey();
    await redis
      .multi()
      .incr(`${key}:total`)
      .incr(`${key}:${kind}`)
      .incr(`rl:reject:user:${userId}`)
      .expire(key, 60 * 60 * 36)
      .expire(`${key}:total`, 60 * 60 * 36)
      .expire(`${key}:${kind}`, 60 * 60 * 36)
      .exec();
  } catch {
    /* 统计失败不影响主流程 */
  }
}

export async function getRateLimitStats(): Promise<{
  todayTotal: number;
  todayMinute: number;
  todayDay: number;
  topOffenders: Array<{ userId: string; count: number }>;
}> {
  const key = rejectDayKey();
  try {
    const [total, minute, day] = await Promise.all([
      redis.get(`${key}:total`),
      redis.get(`${key}:minute`),
      redis.get(`${key}:day`),
    ]);

    const offenders: Array<{ userId: string; count: number }> = [];
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", "rl:reject:user:*", "COUNT", 200);
      cursor = next;
      for (const batchKey of batch) {
        const count = Number((await redis.get(batchKey)) || 0);
        if (count > 0) {
          offenders.push({ userId: batchKey.replace("rl:reject:user:", ""), count });
        }
      }
    } while (cursor !== "0");

    offenders.sort((a, b) => b.count - a.count);

    return {
      todayTotal: Number(total || 0),
      todayMinute: Number(minute || 0),
      todayDay: Number(day || 0),
      topOffenders: offenders.slice(0, 5),
    };
  } catch {
    return { todayTotal: 0, todayMinute: 0, todayDay: 0, topOffenders: [] };
  }
}

/* ---- Redis 运行指标（运维分析用） ---- */

export interface RedisStats {
  ok: boolean;
  version?: string;
  uptimeSeconds?: number;
  connectedClients?: number;
  usedMemoryHuman?: string;
  usedMemoryBytes?: number;
  maxMemoryHuman?: string;
  keyspaceHits?: number;
  keyspaceMisses?: number;
  hitRate?: number;
  totalCommands?: number;
  expiredKeys?: number;
  evictedKeys?: number;
  keyCount?: number;
  role?: string;
  error?: string;
}

export async function getRedisStats(): Promise<RedisStats> {
  try {
    const info = await redis.info();
    const map = new Map<string, string>();
    for (const line of info.split(/\r?\n/)) {
      const index = line.indexOf(":");
      if (index > 0) map.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
    }

    const num = (key: string) => {
      const value = Number(map.get(key));
      return Number.isFinite(value) ? value : undefined;
    };

    const hits = num("keyspace_hits") ?? 0;
    const misses = num("keyspace_misses") ?? 0;

    return {
      ok: true,
      version: map.get("redis_version"),
      uptimeSeconds: num("uptime_in_seconds"),
      connectedClients: num("connected_clients"),
      usedMemoryHuman: map.get("used_memory_human"),
      usedMemoryBytes: num("used_memory"),
      maxMemoryHuman: map.get("maxmemory_human"),
      keyspaceHits: hits,
      keyspaceMisses: misses,
      hitRate: hits + misses > 0 ? Number((hits / (hits + misses)).toFixed(4)) : 0,
      totalCommands: num("total_commands_processed"),
      expiredKeys: num("expired_keys"),
      evictedKeys: num("evicted_keys"),
      role: map.get("role"),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 统计某前缀的键数量（扫全库，仅后台使用） */
export async function countKeys(prefix: string): Promise<number> {
  try {
    let cursor = "0";
    let count = 0;
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
      cursor = next;
      count += batch.length;
    } while (cursor !== "0");
    return count;
  } catch {
    return 0;
  }
}

/* ---- 看板缓存 ---- */

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cacheKey = `cache:${key}`;
  const hit = await redis.get(cacheKey);
  if (hit) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      /* 解析失败则回源 */
    }
  }
  const value = await loader();
  await redis.set(cacheKey, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}

export async function invalidate(prefix: string): Promise<void> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", `cache:${prefix}*`, "COUNT", 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  if (keys.length > 0) await redis.del(...keys);
}

/* ---- 在线标记 ---- */

export async function markActive(userId: string): Promise<void> {
  await redis.set(`active:${userId}`, Date.now().toString(), "EX", 300);
}

export async function activeUserCount(): Promise<number> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", "active:*", "COUNT", 200);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys.length;
}

export async function pingRedis(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
  const start = Date.now();
  try {
    const pong = await redis.ping();
    return { ok: pong === "PONG", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
