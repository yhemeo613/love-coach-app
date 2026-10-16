import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Activity, ListChecks, Bell, Gauge } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MemoryList } from "@/components/memory-list";
import { getUsageTotals } from "@/lib/ai/usage";
import { getUsage, LIMITS } from "@/lib/redis";

export const metadata: Metadata = { title: "我的账号" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser("/login?next=/account");

  const [quota, totals, plans, reminders, conversationCount, messageCount, memories] = await Promise.all([
    getUsage(user.id),
    getUsageTotals(user.id, 7),
    prisma.actionPlan.findMany({
      where: { userId: user.id, status: "open" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, steps: true, createdAt: true },
    }),
    prisma.reminder.findMany({
      where: { userId: user.id, status: "pending" },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, title: true, dueAt: true, note: true },
    }),
    prisma.conversation.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { conversation: { userId: user.id } } }),
    prisma.userMemory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, key: true, value: true, updatedAt: true },
    }),
  ]);

  const cards = [
    { label: "会话数", value: conversationCount, icon: Activity },
    { label: "消息数", value: messageCount, icon: Gauge },
    { label: "今日请求", value: `${quota.dayUsed}/${LIMITS.perDay}`, icon: Gauge },
    { label: "近 7 天请求", value: totals.requests, icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          返回对话
        </Link>

        <h1 className="mt-4 text-xl font-semibold">我的账号与用量</h1>
        <p className="mt-1.5 text-[13px] text-[var(--muted-foreground)]">
          {user.name} · {user.email}
          {user.role === "admin" ? " · 管理员" : ""}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <p className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                <card.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {card.label}
              </p>
              <p className="mt-2 text-xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>

        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-[15px] font-semibold">模型用量明细（近 7 天）</h2>
          <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[var(--muted-foreground)]">输入 tokens</dt>
              <dd className="mt-0.5 font-medium">{totals.promptTokens}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-foreground)]">输出 tokens</dt>
              <dd className="mt-0.5 font-medium">{totals.completionTokens}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-foreground)]">上下文缓存命中</dt>
              <dd className="mt-0.5 font-medium">
                {totals.cachedTokens}（{(totals.cacheHitRate * 100).toFixed(1)}%）
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted-foreground)]">推理 tokens</dt>
              <dd className="mt-0.5 font-medium">{totals.reasoningTokens}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-foreground)]">工具调用</dt>
              <dd className="mt-0.5 font-medium">{totals.toolCalls}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-foreground)]">本分钟配额</dt>
              <dd className="mt-0.5 font-medium">
                {quota.minuteUsed}/{LIMITS.perMinute}
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <ListChecks className="h-4 w-4 text-rose-600" aria-hidden="true" />
              我的行动清单
            </h2>
            {plans.length === 0 ? (
              <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">
                还没有清单。对话中教练给出多条动作时，会自动生成。
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {plans.map((plan) => {
                  const steps = Array.isArray(plan.steps)
                    ? (plan.steps as Array<{ action?: string; when?: string }>)
                    : [];
                  return (
                    <li key={plan.id} className="rounded-xl border border-[var(--border)] p-3">
                      <p className="text-[13.5px] font-medium">{plan.title}</p>
                      <ul className="mt-2 space-y-1">
                        {steps.map((step, index) => (
                          <li
                            key={index}
                            className="text-[12.5px] leading-5 text-[var(--muted-foreground)]"
                          >
                            · {step.action}
                            {step.when ? `（${step.when}）` : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Bell className="h-4 w-4 text-rose-600" aria-hidden="true" />
              待办提醒
            </h2>
            {reminders.length === 0 ? (
              <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">
                还没有提醒。需要跟进时可以让教练设置。
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {reminders.map((reminder) => (
                  <li key={reminder.id} className="rounded-xl border border-[var(--border)] p-3">
                    <p className="text-[13.5px] font-medium">{reminder.title}</p>
                    <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
                      {new Date(reminder.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                    </p>
                    {reminder.note ? (
                      <p className="mt-1 text-[12.5px] leading-5 text-[var(--muted-foreground)]">
                        {reminder.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <MemoryList
            initial={memories.map((memory) => ({
              id: memory.id,
              key: memory.key,
              value: memory.value,
              updatedAt: memory.updatedAt.toISOString(),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
