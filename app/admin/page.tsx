import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Database,
  Inbox,
  MessagesSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import { ModelDonutChart, RequestsTrendChart, SceneDonutChart } from "@/components/admin/charts/overview-charts";
import { StatCard } from "@/components/admin/stat-card";
import { formatDateTime, formatNumber, humanAuditAction, truncate } from "./_lib/format";
import { getAdminOverview } from "./_lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "总览" };

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">总览</h1>
          <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
            聚合数据缓存 30 秒；生成时间 {formatDateTime(overview.generatedAt)}
          </p>
        </div>
        <p className="text-[11.5px] text-[var(--muted-foreground)]">
          今日活跃 = Redis 中 5 分钟内有请求标记的账号数
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="用户总数" value={overview.userTotal} icon={Users} hint="全部注册账号" />
        <StatCard
          label="近 7 天新增用户"
          value={overview.userNewIn7Days}
          icon={TrendingUp}
          hint="按注册时间统计"
        />
        <StatCard
          label="今日活跃"
          value={overview.activeUsers}
          icon={Activity}
          hint="Redis 在线标记（5 分钟窗口）"
        />
        <StatCard label="会话总数" value={overview.conversationTotal} icon={MessagesSquare} />
        <StatCard label="消息总数" value={overview.messageTotal} icon={Database} />
        <StatCard
          label="今日请求数"
          value={overview.requestsToday}
          icon={Activity}
          hint="usage_daily 当日汇总"
        />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">近 7 天请求量与 token 消耗</h2>
            <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
              按 usage_daily 汇总（UTC 自然日）；tokens 为输入与输出之和
            </p>
          </div>
        </div>
        <RequestsTrendChart data={overview.trend} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold">场景分布</h2>
          <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
            按会话所属场景统计，可看出用户主要集中在哪些困境
          </p>
          <SceneDonutChart slices={overview.scenes} />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold">模型占比</h2>
          <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
            近 7 天各模型产生的教练回复条数
          </p>
          <ModelDonutChart slices={overview.models} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">最近管理操作</h2>
            <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
              最新 10 条审计日志（audit_log）
            </p>
          </div>
          <Link
            href="/admin/users"
            className="text-[12px] text-[var(--primary)] underline-offset-2 hover:underline"
          >
            去用户管理
          </Link>
        </div>

        {overview.audits.length === 0 ? (
          <p className="mt-6 flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
            <Inbox className="h-4 w-4" aria-hidden="true" />
            暂无管理操作记录。
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="text-[11.5px] text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-4 font-medium">时间</th>
                  <th className="pb-2 pr-4 font-medium">操作者</th>
                  <th className="pb-2 pr-4 font-medium">动作</th>
                  <th className="pb-2 pr-4 font-medium">详情</th>
                  <th className="pb-2 font-medium">来源 IP</th>
                </tr>
              </thead>
              <tbody>
                {overview.audits.map((audit) => (
                  <tr key={audit.id} className="border-t border-[var(--border)] align-top">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-[var(--muted-foreground)]">
                      {formatDateTime(audit.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4">{audit.actorName}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4">
                      <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                        {humanAuditAction(audit.action)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">{truncate(audit.detail, 80)}</td>
                    <td className="whitespace-nowrap py-2.5 font-mono text-[11.5px] text-[var(--muted-foreground)]">
                      {audit.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[11.5px] text-[var(--muted-foreground)]">
          共 {formatNumber(overview.audits.length)} 条记录，完整审计请在数据库中查询 audit_log 表。
        </p>
      </section>
    </div>
  );
}
