import type { Metadata } from "next";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  HeartHandshake,
  KeyRound,
  Server,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime, formatNumber } from "../_lib/format";
import { collectSystemStatus, type CheckResult } from "../_lib/system";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "系统状态" };

function CheckCard({
  title,
  subtitle,
  result,
  icon: Icon,
  detail,
}: {
  title: string;
  subtitle: string;
  result: CheckResult;
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13.5px] font-medium">
            <Icon className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            {title}
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">{subtitle}</p>
        </div>
        <span
          className={
            result.ok
              ? "inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11.5px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11.5px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
          }
        >
          {result.ok ? (
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          )}
          {result.ok ? "连通" : "异常"}
        </span>
      </div>

      <p className="mt-3 text-[12.5px] text-[var(--muted-foreground)]">
        响应耗时 <span className="tabular-nums text-[var(--foreground)]">{result.latencyMs} ms</span>
      </p>
      {detail ? <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">{detail}</p> : null}
      {!result.ok && result.message ? (
        <p className="mt-2 break-words rounded-lg bg-rose-50/70 p-2 font-mono text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

export default async function AdminSystemPage() {
  const status = await collectSystemStatus();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">系统状态</h1>
        <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
          实时检测，不做缓存；检测时间 {formatDateTime(status.generatedAt)}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold">连通性检测</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <CheckCard
            title="Postgres"
            subtitle="prisma.$queryRaw · SELECT 1"
            result={status.postgres}
            icon={Database}
            detail="驱动：@prisma/adapter-pg（Prisma 7 driver adapter）"
          />
          <CheckCard
            title="Redis"
            subtitle="pingRedis() · 会话、限流与看板缓存"
            result={status.redis}
            icon={Server}
            detail="用途：Better Auth 二级存储 / 对话限流 / 看板缓存 30 秒"
          />
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[13.5px] font-medium">
                  <HeartHandshake className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                  大模型
                </p>
                <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">
                  OpenAI 兼容接口（读取环境变量，密钥已脱敏）
                </p>
              </div>
              <span
                className={
                  status.llm.configured
                    ? "inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11.5px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11.5px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                }
              >
                {status.llm.configured ? (
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                )}
                {status.llm.configured ? "已配置" : "缺少密钥"}
              </span>
            </div>

            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">LLM_MODEL</dt>
                <dd className="font-mono text-[12px]">{status.llm.model}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-[var(--muted-foreground)]">LLM_API_BASE</dt>
                <dd className="truncate font-mono text-[12px]" title={status.llm.apiBase}>
                  {status.llm.apiBase}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1 text-[var(--muted-foreground)]">
                  <KeyRound className="h-3 w-3" aria-hidden="true" />
                  LLM_API_KEY
                </dt>
                <dd className="font-mono text-[12px]">{status.llm.apiKeyMasked}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">温度 / 最大 token</dt>
                <dd className="font-mono text-[12px]">
                  {status.llm.temperature} / {status.llm.maxTokens}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted-foreground)]">上下文条数上限</dt>
                <dd className="font-mono text-[12px]">{status.llm.historyLimit}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Gauge className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            运行配置
          </h2>
          <dl className="mt-4 space-y-2.5 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--muted-foreground)]">每用户每分钟请求上限</dt>
              <dd className="tabular-nums">{formatNumber(status.config.rateLimitPerMinute)} 次</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--muted-foreground)]">每用户每日请求上限</dt>
              <dd className="tabular-nums">{formatNumber(status.config.rateLimitPerDay)} 次</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-[var(--muted-foreground)]">ADMIN_EMAILS</dt>
              <dd className="text-right">
                {status.config.adminEmails.length === 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    未配置（首次登录不会自动赋管理员）
                  </span>
                ) : (
                  <span className="font-mono text-[12px]">{status.config.adminEmails.join("、")}</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--muted-foreground)]">ALLOW_PASSWORD_LOGIN</dt>
              <dd>
                {status.config.allowPasswordLogin ? (
                  <span className="text-amber-600 dark:text-amber-400">已开启（生产环境应为 0）</span>
                ) : (
                  <span>已关闭</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--muted-foreground)]">站点名称</dt>
              <dd>{status.config.siteName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--muted-foreground)]">运行环境</dt>
              <dd className="font-mono text-[12px]">{status.config.nodeEnv}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--muted-foreground)]">Node 版本</dt>
              <dd className="font-mono text-[12px]">{status.config.nodeVersion}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1 text-[var(--muted-foreground)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                运行时长
              </dt>
              <dd>
                {status.config.uptimeText}
                <span className="ml-1 text-[11px] text-[var(--muted-foreground)]">
                  （{formatNumber(status.config.uptimeSeconds)} 秒）
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Activity className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            Redis 概况
          </h2>
          <p className="mt-4 text-2xl font-semibold tabular-nums">
            {formatNumber(status.activeUsers)}
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">
            当前活跃用户数（active:* 键，5 分钟过期）
          </p>

          <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4 text-[12px] text-[var(--muted-foreground)]">
            <p>缓存键前缀：cache:admin:*（总览聚合缓存 30 秒，管理操作后立即失效）</p>
            <p>限流键：rl:min:&lt;userId&gt;:&lt;分钟&gt; 与 rl:day:&lt;userId&gt;:&lt;日期&gt;（UTC 自然日）</p>
            <p>重置配额只删除当日 rl:day 键，不修改 usage_daily 统计。</p>
          </div>
        </div>
      </section>

      <p className="text-[11.5px] leading-5 text-[var(--muted-foreground)]">
        密钥仅以脱敏形式展示（前 5 位 + 后 2 位），页面不会输出完整密钥；如需轮换请修改服务端环境变量后重启。
      </p>
    </div>
  );
}
