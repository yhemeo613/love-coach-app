import type { Metadata } from "next";
import { Activity, AlertTriangle, CheckCircle2, Database, HardDrive, Server, Zap } from "lucide-react";
import { getOpsOverview } from "@/app/admin/_lib/metrics";
import { StatCard } from "@/components/admin/stat-card";
import { Chart } from "@/components/admin/charts/chart";
import { CHART_COLORS, baseOption, categoryAxis, valueAxis } from "@/components/admin/charts/chart-theme";
import { formatNumber } from "@/app/admin/_lib/format";
import type { EChartsOption } from "echarts";

export const metadata: Metadata = { title: "运维分析" };
export const dynamic = "force-dynamic";

function humanDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      }
    >
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
      {ok ? "正常" : "异常"}
    </span>
  );
}

export default async function AdminOpsPage() {
  const ops = await getOpsOverview();

  /* ---------- 请求量 / tokens 趋势（近 14 天，双轴） ---------- */
  const trendOption: EChartsOption = baseOption({
    legend: {
      top: 0,
      right: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    grid: { top: 36, right: 56, bottom: 28, left: 52 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
    },
    xAxis: { ...categoryAxis, data: ops.requests.last14d.map((p) => p.label) },
    yAxis: [
      { ...valueAxis, name: "请求", nameTextStyle: { fontSize: 11, color: "var(--muted-foreground)" } },
      {
        ...valueAxis,
        name: "tokens",
        nameTextStyle: { fontSize: 11, color: "var(--muted-foreground)" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "请求数",
        type: "bar",
        data: ops.requests.last14d.map((p) => p.requests),
        barWidth: 14,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: CHART_COLORS.primary },
      },
      {
        name: "tokens",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        data: ops.requests.last14d.map((p) => p.tokens),
        lineStyle: { width: 2, color: CHART_COLORS.sky },
        itemStyle: { color: CHART_COLORS.sky },
        areaStyle: { color: "rgba(14,165,233,0.12)" },
      },
    ],
  });

  /* ---------- 推理 token 占比（思考模式使用情况） ---------- */
  const reasoningOption: EChartsOption = baseOption({
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
    },
    grid: { top: 20, right: 18, bottom: 28, left: 52 },
    xAxis: { ...categoryAxis, data: ops.requests.last14d.map((p) => p.label) },
    yAxis: { ...valueAxis, name: "tokens", nameTextStyle: { fontSize: 11, color: "var(--muted-foreground)" } },
    series: [
      {
        name: "推理 tokens",
        type: "bar",
        stack: "token",
        data: ops.requests.last14d.map((p) => p.reasoningTokens),
        itemStyle: { color: CHART_COLORS.violet },
      },
      {
        name: "工具调用",
        type: "bar",
        stack: "token2",
        data: ops.requests.last14d.map((p) => p.toolCalls),
        itemStyle: { color: CHART_COLORS.emerald },
      },
    ],
  });

  /* ---------- 表体积（Top 5） ---------- */
  const tableOption: EChartsOption = baseOption({
    grid: { top: 12, right: 48, bottom: 12, left: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      formatter: "{b}<br/>{c} MB",
    },
    xAxis: { ...valueAxis, splitLine: { lineStyle: { color: "var(--border)", type: "dashed" } } },
    yAxis: {
      type: "category",
      data: ops.postgres.tables.map((t) => t.name).reverse(),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        data: ops.postgres.tables.map((t) => t.sizeMb).reverse(),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 6, 6, 0], color: CHART_COLORS.teal },
        label: { show: true, position: "right", fontSize: 11, color: "var(--muted-foreground)", formatter: "{c} MB" },
      },
    ],
  });

  const hitRate = ops.redis.hitRate ?? 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">运维分析</h1>
        <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
          主机与进程资源、Postgres 与 Redis 运行指标、模型调用质量与限流拦截情况。数据为实时读取，不做缓存。
        </p>
      </header>

      {/* 连通性 */}
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="flex items-center justify-between text-[13px] font-medium">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
              PostgreSQL
            </span>
            <StatusDot ok={ops.postgres.ok} />
          </p>
          <dl className="mt-3 space-y-1 text-[12px] text-[var(--muted-foreground)]">
            <div className="flex justify-between">
              <dt>响应耗时</dt>
              <dd className="font-medium text-[var(--foreground)]">{ops.postgres.latencyMs} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt>版本</dt>
              <dd>{ops.postgres.version ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>库体积</dt>
              <dd>{ops.postgres.databaseSizeMb ?? "—"} MB</dd>
            </div>
            <div className="flex justify-between">
              <dt>连接数</dt>
              <dd>
                {ops.postgres.connectionsUsed ?? 0} / {ops.postgres.connectionsMax ?? 0}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>缓冲区命中率</dt>
              <dd>{((ops.postgres.cacheHitRate ?? 0) * 100).toFixed(2)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt>事务 提交 / 回滚</dt>
              <dd>
                {formatNumber(ops.postgres.committed ?? 0)} / {formatNumber(ops.postgres.rolledBack ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>死锁</dt>
              <dd className={ops.postgres.deadlocks ? "text-amber-600 dark:text-amber-400" : ""}>
                {ops.postgres.deadlocks ?? 0}
              </dd>
            </div>
          </dl>
          {ops.postgres.error ? (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">{ops.postgres.error}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="flex items-center justify-between text-[13px] font-medium">
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
              Redis
            </span>
            <StatusDot ok={ops.redis.ok} />
          </p>
          <dl className="mt-3 space-y-1 text-[12px] text-[var(--muted-foreground)]">
            <div className="flex justify-between">
              <dt>版本 / 角色</dt>
              <dd>
                {ops.redis.version ?? "—"} / {ops.redis.role ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>内存占用</dt>
              <dd className="font-medium text-[var(--foreground)]">{ops.redis.usedMemoryHuman ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>连接客户端</dt>
              <dd>{ops.redis.connectedClients ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>键总数</dt>
              <dd>{formatNumber(ops.redisKeys.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>缓存命中率</dt>
              <dd>{(hitRate * 100).toFixed(2)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt>累计命令</dt>
              <dd>{formatNumber(ops.redis.totalCommands ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>过期 / 淘汰键</dt>
              <dd>
                {formatNumber(ops.redis.expiredKeys ?? 0)} / {ops.redis.evictedKeys ?? 0}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
            键分布：缓存 {ops.redisKeys.cache} · 限流 {ops.redisKeys.rateLimit} · 会话 {ops.redisKeys.session} · 在线 {ops.redisKeys.active}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="flex items-center justify-between text-[13px] font-medium">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
              大模型上游
            </span>
            <StatusDot ok={ops.llm.reachable} />
          </p>
          <dl className="mt-3 space-y-1 text-[12px] text-[var(--muted-foreground)]">
            <div className="flex justify-between">
              <dt>当前默认</dt>
              <dd className="font-mono text-[11px]">{ops.llm.model}</dd>
            </div>
            <div className="flex justify-between">
              <dt>可用模型</dt>
              <dd className="text-right font-mono text-[11px]">{ops.llm.models.join(", ") || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>接入点</dt>
              <dd className="max-w-[62%] truncate text-right font-mono text-[11px]">{ops.llm.base}</dd>
            </div>
            <div className="flex justify-between">
              <dt>余额</dt>
              <dd>
                {ops.llm.balance ? `${ops.llm.balance.total} ${ops.llm.balance.currency}` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 指标卡 */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="进程内存（RSS）"
          value={`${ops.runtime.rssMb} MB`}
          hint={`堆 ${ops.runtime.heapUsedMb} / ${ops.runtime.heapTotalMb} MB`}
        />
        <StatCard
          label="主机内存占用"
          value={`${ops.runtime.hostUsedPercent}%`}
          hint={`${ops.runtime.hostFreeMb} MB 可用 / 共 ${ops.runtime.hostTotalMb} MB`}
        />
        <StatCard
          label="负载与 CPU"
          value={ops.runtime.loadAvg.join(" / ")}
          hint={`${ops.runtime.cpuCount} 核 · 运行 ${humanDuration(ops.runtime.uptimeSeconds)}`}
        />
        <StatCard
          label="近 14 天请求"
          value={formatNumber(ops.requests.totalRequests14d)}
          hint={`tokens ${formatNumber(ops.requests.totalTokens14d)} · 缓存命中 ${(ops.requests.cacheHitRate14d * 100).toFixed(1)}%`}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="今日限流拦截" value={formatNumber(ops.rateLimitStats.todayTotal)} hint={`分钟窗口 ${ops.rateLimitStats.todayMinute} · 日配额 ${ops.rateLimitStats.todayDay}`} />
        <StatCard label="推理 tokens（14 天）" value={formatNumber(ops.requests.reasoningTokens14d)} hint="思考模式产生的推理开销" />
        <StatCard label="工具调用（14 天）" value={formatNumber(ops.requests.toolCalls14d)} hint="知识检索 / 行动清单 / 提醒等" />
        <StatCard label="在线用户" value={ops.activeUsers} hint="按 5 分钟活跃窗口统计" />
      </section>

      {/* 图表 */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Activity className="h-4 w-4 text-rose-600" aria-hidden="true" />
          请求量与 token 趋势（近 14 天）
        </h2>
        <Chart option={trendOption} height={300} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-[14px] font-semibold">推理开销与工具调用</h2>
          <Chart option={reasoningOption} height={260} />
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <HardDrive className="h-4 w-4 text-rose-600" aria-hidden="true" />
            数据表体积 Top 5
          </h2>
          {ops.postgres.tables.length > 0 ? (
            <Chart option={tableOption} height={260} />
          ) : (
            <p className="mt-6 text-[13px] text-[var(--muted-foreground)]">暂无表统计信息。</p>
          )}
        </section>
      </div>

      {/* 限流明细 + 数据规模 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-[14px] font-semibold">限流拦截明细</h2>
          <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
            限额：每用户每分钟 {ops.limits.perMinute} 次 · 每日 {ops.limits.perDay} 次（Redis 计数，UTC 自然日）
          </p>
          {ops.rateLimitStats.topOffenders.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {ops.rateLimitStats.topOffenders.map((offender) => (
                <li key={offender.userId} className="flex items-center justify-between text-[12.5px]">
                  <span className="truncate font-mono text-[11.5px] text-[var(--muted-foreground)]">
                    {offender.userId}
                  </span>
                  <span className="font-medium">{offender.count} 次</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">今日暂无被拦截的请求。</p>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-[14px] font-semibold">数据规模</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
            {[
              ["用户", ops.data.users],
              ["会话", ops.data.conversations],
              ["消息", ops.data.messages],
              ["行动清单", ops.data.actionPlans],
              ["提醒", ops.data.reminders],
              ["审计记录", ops.data.audits],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-[var(--border)] p-3">
                <dt className="text-[var(--muted-foreground)]">{label}</dt>
                <dd className="mt-1 text-[15px] font-semibold">{formatNumber(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px] text-[var(--muted-foreground)]">
            Node {ops.runtime.nodeVersion} · {ops.runtime.platform} · {ops.runtime.arch} · 环境 {ops.runtime.env} ·
            进程已运行 {humanDuration(ops.runtime.processUptimeSeconds)}
          </p>
        </section>
      </div>
    </div>
  );
}
