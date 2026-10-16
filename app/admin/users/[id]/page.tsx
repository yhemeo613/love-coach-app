import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlarmClock,
  ArrowLeft,
  Ban,
  ChartColumn,
  Clock,
  Coins,
  Cpu,
  Gauge,
  Layers,
  ListChecks,
  Mail,
  MessageSquare,
  MessagesSquare,
  Percent,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { HourlyActivityChart } from "@/components/admin/user-profile/hourly-activity-chart";
import { ModelUsageTable } from "@/components/admin/user-profile/model-usage-table";
import { EmptyNote, ProfileSection } from "@/components/admin/user-profile/profile-section";
import { ProfileTagList } from "@/components/admin/user-profile/profile-tags";
import { SceneMixChart } from "@/components/admin/user-profile/scene-mix-chart";
import { UsageTrendChart } from "@/components/admin/user-profile/usage-trend-chart";
import { humanizedAgo, loadUserProfile } from "@/components/admin/user-profile/profile-data";
import { requireAdmin } from "@/lib/session";
import { formatDateTime, formatNumber, humanRole, initialOf, truncate } from "../../_lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "用户画像" };

interface UserProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserProfilePage({ params }: UserProfilePageProps) {
  const admin = await requireAdmin();
  const { id } = await params;

  const profile = await loadUserProfile(id);
  if (!profile) notFound();

  const { user, metrics, quota } = profile;
  const isSelf = user.id === admin.id;
  const hasMessages = metrics.messages > 0;
  const hasTrend = profile.trend.some((point) => point.requests > 0 || point.tokens > 0);
  const cachePercent = Math.round(metrics.cacheHitRate7 * 1000) / 10;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--muted-foreground)] transition hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          返回用户列表
        </Link>
        <p className="text-[11.5px] text-[var(--muted-foreground)]">
          只读视图 · 数据生成于 {formatDateTime(profile.generatedAt)}
        </p>
      </div>

      {/* 风险提示：命中守护场景属于安全相关信号，必须显式提示 */}
      {profile.supportConversationCount > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm dark:border-rose-900 dark:bg-rose-950/25">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-rose-700 dark:text-rose-300">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            命中守护场景 · 建议人工关注
          </p>
          <p className="mt-2 text-[12.5px] leading-6 text-rose-700/90 dark:text-rose-300/90">
            该用户有 {formatNumber(profile.supportConversationCount)} 个「被操控 / 被拉扯」（sceneId =
            support）会话。这是安全相关信号：该场景用于识别忽冷忽热、贬低、隔离等模式，
            不涉及技巧教学。建议人工关注其会话内容与后续行为，必要时在对话中给出心理援助热线
            12356 等线下支持资源。
          </p>
        </section>
      ) : null}

      {/* 顶部：身份、角色、状态与时间线 */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[18px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {initialOf(user.name)}
              </span>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{user.name}</h1>
                {isSelf ? (
                  <span className="rounded-md bg-[var(--primary)]/10 px-1.5 py-0.5 text-[10.5px] text-[var(--primary)]">
                    你自己
                  </span>
                ) : null}
                <span
                  className={
                    user.role === "admin"
                      ? "inline-flex items-center gap-1 rounded-md bg-[var(--primary)]/10 px-1.5 py-0.5 text-[11.5px] text-[var(--primary)]"
                      : "inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11.5px] text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                  }
                >
                  {user.role === "admin" ? (
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Users className="h-3 w-3" aria-hidden="true" />
                  )}
                  {humanRole(user.role)}
                </span>
                {user.banned ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11.5px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    已封禁
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11.5px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    正常
                  </span>
                )}
              </div>

              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--muted-foreground)]">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {user.email}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--muted-foreground)]">{user.id}</p>

              {user.banned ? (
                <p className="mt-2 max-w-[560px] rounded-xl bg-rose-50/70 p-2.5 text-[11.5px] leading-5 text-rose-700 dark:bg-rose-950/25 dark:text-rose-300">
                  封禁原因：{truncate(user.banReason, 120)}；
                  {user.banExpires ? `解封时间 ${formatDateTime(user.banExpires)}` : "永久封禁"}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-3">
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                注册时间
              </dt>
              <dd className="mt-0.5">{formatDateTime(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <UserRound className="h-3 w-3" aria-hidden="true" />
                资料更新时间
              </dt>
              <dd className="mt-0.5">{formatDateTime(user.updatedAt)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <Activity className="h-3 w-3" aria-hidden="true" />
                最近活跃
              </dt>
              <dd className="mt-0.5">
                {formatDateTime(profile.lastActiveAt)}
                <span className="ml-1 text-[11px] text-[var(--muted-foreground)]">
                  {profile.lastActiveSource ? `（${profile.lastActiveSource}）` : ""}
                </span>
                <span className="block text-[11px] text-[var(--muted-foreground)]">
                  {humanizedAgo(profile.lastActiveAt)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <Percent className="h-3 w-3" aria-hidden="true" />
                今日配额（Redis 实时）
              </dt>
              <dd className="mt-0.5 tabular-nums">
                {quota
                  ? `${formatNumber(quota.dayUsed)} / ${formatNumber(quota.dayLimit)}`
                  : "Redis 不可用"}
                {quota ? (
                  <span className="block text-[11px] text-[var(--muted-foreground)]">
                    分钟窗口 {formatNumber(quota.minuteUsed)} / {formatNumber(quota.minuteLimit)}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 指标卡 */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="会话数"
          value={metrics.conversations}
          icon={MessagesSquare}
          hint="conversation 表，该用户全部会话"
        />
        <StatCard
          label="消息数"
          value={metrics.messages}
          icon={MessageSquare}
          hint="message 表，含用户与教练两侧"
        />
        <StatCard
          label="行动清单数"
          value={metrics.actionPlans}
          icon={ListChecks}
          hint={`其中已完成 ${formatNumber(metrics.actionPlansDone)} 条`}
        />
        <StatCard
          label="待办提醒数"
          value={metrics.remindersPending}
          icon={AlarmClock}
          hint="reminder.status = pending"
        />
        <StatCard
          label="近 7 天请求数"
          value={metrics.requests7}
          icon={Activity}
          hint={`近 30 天共 ${formatNumber(metrics.requests30)} 次`}
        />
        <StatCard
          label="近 7 天 token 总数"
          value={metrics.tokens7}
          icon={Coins}
          hint={`prompt ${formatNumber(metrics.promptTokens7)} + completion ${formatNumber(
            metrics.completionTokens7,
          )}`}
        />
        <StatCard
          label="缓存命中率"
          value={cachePercent}
          icon={Gauge}
          hint={`单位 %，cachedTokens ${formatNumber(metrics.cachedTokens7)} / promptTokens ${formatNumber(
            metrics.promptTokens7,
          )}`}
        />
        <StatCard
          label="工具调用次数"
          value={metrics.toolCalls7}
          icon={Wrench}
          hint="usage_daily.toolCalls（近 7 天）"
        />
      </section>

      {/* 自动画像标签 */}
      <ProfileSection
        title="自动画像标签"
        description="基于 usage_daily 与业务表的规则判定，每张卡片标注一句话判定依据；风险维度排在最前"
        icon={Gauge}
      >
        <ProfileTagList tags={profile.tags} />
      </ProfileSection>

      {/* 用量趋势 */}
      <ProfileSection
        title="近 30 天用量趋势"
        description="usage_daily 按 UTC 自然日汇总，缺失日期补 0；左轴请求数，右轴 token"
        icon={TrendingUp}
        action={
          <p className="text-[11.5px] text-[var(--muted-foreground)]">
            近 30 天：{formatNumber(metrics.requests30)} 次请求 · {formatNumber(metrics.tokens30)} tokens
          </p>
        }
      >
        {hasTrend ? (
          <UsageTrendChart data={profile.trend} />
        ) : (
          <EmptyNote text="暂无数据：该用户近 30 天没有用量记录。" />
        )}
      </ProfileSection>

      {/* 场景偏好 + 活跃时段 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ProfileSection
          title="场景偏好"
          description="该用户各场景会话数（中文场景名 + 场景代号）"
          icon={Layers}
        >
          {profile.scenes.length > 0 ? (
            <SceneMixChart slices={profile.scenes} />
          ) : (
            <EmptyNote text="暂无数据：该用户还没有创建会话。" />
          )}
        </ProfileSection>

        <ProfileSection
          title="活跃时段分布"
          description={
            hasMessages
              ? profile.peakHour
                ? `按 message.createdAt 的北京时间（UTC+8）小时聚合；峰值 ${profile.peakHour.hour} 时（${formatNumber(
                    profile.peakHour.count,
                  )} 条消息）`
                : "按 message.createdAt 的北京时间（UTC+8）小时聚合"
              : "按 message.createdAt 的北京时间（UTC+8）小时聚合"
          }
          icon={ChartColumn}
        >
          {hasMessages ? (
            <HourlyActivityChart
              hours={profile.hours}
              peakHour={profile.peakHour ? profile.peakHour.hour : null}
            />
          ) : (
            <EmptyNote text="暂无数据：该用户没有任何消息。" />
          )}
        </ProfileSection>
      </div>

      {/* 模型使用分布 */}
      <ProfileSection
        title="模型使用分布"
        description="按 message.model 分组统计消息数与 token 数，空 model 归入「未记录」"
        icon={Cpu}
      >
        {profile.models.length > 0 ? (
          <ModelUsageTable rows={profile.models} />
        ) : (
          <EmptyNote text="暂无数据：该用户没有任何消息。" />
        )}
      </ProfileSection>

      {/* 内容概览 */}
      <ProfileSection
        title="内容概览"
        description="最近 10 条会话，按更新时间倒序；标题可进入会话详情（只读）"
        icon={MessagesSquare}
      >
        {profile.recentConversations.length === 0 ? (
          <EmptyNote text="暂无数据：该用户还没有创建会话。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="text-[11.5px] text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-4 font-medium">标题</th>
                  <th className="pb-2 pr-4 font-medium">场景</th>
                  <th className="pb-2 pr-4 font-medium">消息数</th>
                  <th className="pb-2 font-medium">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {profile.recentConversations.map((conversation) => (
                  <tr key={conversation.id} className="border-t border-[var(--border)]">
                    <td className="max-w-[320px] py-3 pr-4">
                      <Link
                        href={`/admin/conversations/${conversation.id}`}
                        className="block truncate font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                      >
                        {conversation.title}
                      </Link>
                      <span className="block truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                        {conversation.id}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11.5px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                        {conversation.sceneCode} {conversation.sceneName}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatNumber(conversation.messageCount)}
                    </td>
                    <td className="whitespace-nowrap py-3 text-[12px] text-[var(--muted-foreground)]">
                      {formatDateTime(conversation.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ProfileSection>

      <p className="text-[11.5px] leading-5 text-[var(--muted-foreground)]">
        画像标签由规则自动生成，仅作运营参考，不构成对用户的定性判断；
        「近 7 天 / 近 30 天」均按 usage_daily 的 UTC 自然日统计，活跃时段按北京时间（UTC+8）小时聚合。
        本页为只读视图，不提供任何写操作。
      </p>
    </div>
  );
}
