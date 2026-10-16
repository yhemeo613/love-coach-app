import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Inbox, Search, ShieldCheck, Users } from "lucide-react";
import { Pagination } from "@/components/admin/pagination";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { LIMITS } from "@/lib/redis";
import { requireAdmin } from "@/lib/session";
import { formatDateTime, formatNumber, humanRole, initialOf, truncate } from "../_lib/format";
import { listUsers, readPageParam, readSearchParam } from "../_lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "用户管理" };

interface UsersPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const q = readSearchParam(params.q);
  const page = readPageParam(params.page);
  const data = await listUsers(q, page);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">用户管理</h1>
          <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
            角色调整、封禁与配额重置；每页 {data.pageSize} 条，按注册时间倒序
          </p>
        </div>

        <form action="/admin/users" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="搜索邮箱或昵称"
              className="w-60 rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-8 pr-3 text-[13px] outline-none focus:border-[var(--primary)]"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-3 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition hover:opacity-90"
          >
            搜索
          </button>
          {q ? (
            <Link
              href="/admin/users"
              className="text-[12.5px] text-[var(--muted-foreground)] underline-offset-2 hover:underline"
            >
              清除
            </Link>
          ) : null}
        </form>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        {data.items.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-[var(--muted-foreground)]">
            <Inbox className="h-4 w-4" aria-hidden="true" />
            {q ? `没有匹配「${q}」的用户。` : "暂无用户数据。"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-4 font-medium">用户</th>
                  <th className="pb-2 pr-4 font-medium">角色</th>
                  <th className="pb-2 pr-4 font-medium">状态</th>
                  <th className="pb-2 pr-4 font-medium">注册时间</th>
                  <th className="pb-2 pr-4 font-medium">会话数</th>
                  <th className="pb-2 pr-4 font-medium">今日用量</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => {
                  const isSelf = user.id === admin.id;
                  const isAdminRole = user.role === "admin";
                  return (
                    <tr key={user.id} className="border-t border-[var(--border)] align-top">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          {user.image ? (
                            <img
                              src={user.image}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-full border border-[var(--border)] object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[13px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                              {initialOf(user.name)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-medium">
                              <span className="truncate">{user.name}</span>
                              {isSelf ? (
                                <span className="rounded-md bg-[var(--primary)]/10 px-1.5 py-0.5 text-[10.5px] text-[var(--primary)]">
                                  你自己
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--muted-foreground)]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <span
                          className={
                            isAdminRole
                              ? "inline-flex items-center gap-1 rounded-md bg-[var(--primary)]/10 px-1.5 py-0.5 text-[11.5px] text-[var(--primary)]"
                              : "inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11.5px] text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                          }
                        >
                          {isAdminRole ? (
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Users className="h-3 w-3" aria-hidden="true" />
                          )}
                          {humanRole(user.role)}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        {user.banned ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11.5px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              <Ban className="h-3 w-3" aria-hidden="true" />
                              已封禁
                            </span>
                            <p className="max-w-[220px] text-[11px] text-[var(--muted-foreground)]">
                              {truncate(user.banReason, 40)}
                            </p>
                            <p className="text-[11px] text-[var(--muted-foreground)]">
                              {user.banExpires ? `解封时间 ${formatDateTime(user.banExpires)}` : "永久封禁"}
                            </p>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11.5px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            正常
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap py-3 pr-4 text-[12.5px] text-[var(--muted-foreground)]">
                        {formatDateTime(user.createdAt)}
                      </td>

                      <td className="py-3 pr-4 tabular-nums">{formatNumber(user.conversationCount)}</td>

                      <td className="py-3 pr-4 tabular-nums">
                        {formatNumber(user.requestsToday)}
                        <span className="text-[11.5px] text-[var(--muted-foreground)]">
                          {" "}
                          / {formatNumber(LIMITS.perDay)}
                        </span>
                      </td>

                      <td className="py-3">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="mb-2 inline-flex items-center rounded-lg border border-[var(--border)] px-2 py-1 text-[11.5px] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        >
                          查看画像
                        </Link>
                        <UserRowActions
                          userId={user.id}
                          role={user.role}
                          banned={user.banned}
                          isSelf={isSelf}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          basePath="/admin/users"
          page={data.page}
          pageCount={data.pageCount}
          total={data.total}
          q={q}
        />
      </section>

      <p className="text-[11.5px] leading-5 text-[var(--muted-foreground)]">
        今日用量来自 usage_daily（与用户侧每日配额同源）；「重置配额」只清除 Redis 中的当日对话计数，
        不会改动 usage_daily 的统计值。管理员不能封禁自己，接口层也会再次校验。
      </p>
    </div>
  );
}
