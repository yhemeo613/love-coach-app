import { prisma } from "@/lib/prisma";
import { LIMITS, activeUserCount, pingRedis } from "@/lib/redis";
import { ADMIN_EMAILS } from "@/lib/auth";
import { formatUptime, maskSecret } from "./format";

/**
 * 系统状态采集：/admin/system 页面与 /api/admin/system 接口共用，
 * 保证页面与接口看到的是同一份口径。全部为实时读取，不做缓存。
 */

export interface CheckResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
}

export interface AdminSystemStatus {
  postgres: CheckResult;
  redis: CheckResult;
  llm: {
    model: string;
    apiBase: string;
    apiKeyMasked: string;
    configured: boolean;
    temperature: string;
    maxTokens: string;
    historyLimit: string;
  };
  config: {
    rateLimitPerMinute: number;
    rateLimitPerDay: number;
    adminEmails: string[];
    allowPasswordLogin: boolean;
    nodeVersion: string;
    nodeEnv: string;
    siteName: string;
    uptimeSeconds: number;
    uptimeText: string;
  };
  activeUsers: number;
  generatedAt: string;
}

async function checkPostgres(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectSystemStatus(): Promise<AdminSystemStatus> {
  const uptimeSeconds = process.uptime();
  const [postgres, redis, activeUsers] = await Promise.all([
    checkPostgres(),
    pingRedis(),
    activeUserCount().catch(() => 0),
  ]);

  const apiKey = process.env.LLM_API_KEY ?? "";

  return {
    postgres,
    redis,
    llm: {
      model: process.env.LLM_MODEL || "deepseek-chat",
      apiBase: process.env.LLM_API_BASE || "https://api.deepseek.com/v1",
      apiKeyMasked: maskSecret(apiKey),
      configured: apiKey.trim().length > 0,
      temperature: process.env.LLM_TEMPERATURE || "0.7",
      maxTokens: process.env.LLM_MAX_TOKENS || "1600",
      historyLimit: process.env.CHAT_HISTORY_LIMIT || "16",
    },
    config: {
      rateLimitPerMinute: LIMITS.perMinute,
      rateLimitPerDay: LIMITS.perDay,
      adminEmails: ADMIN_EMAILS,
      allowPasswordLogin: process.env.ALLOW_PASSWORD_LOGIN === "1",
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || "development",
      siteName: process.env.NEXT_PUBLIC_SITE_NAME || "恋爱教练",
      uptimeSeconds: Math.round(uptimeSeconds),
      uptimeText: formatUptime(uptimeSeconds),
    },
    activeUsers,
    generatedAt: new Date().toISOString(),
  };
}
