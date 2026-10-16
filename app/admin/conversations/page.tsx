import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, MessagesSquare, Search } from "lucide-react";
import { Pagination } from "@/components/admin/pagination";
import { accentOf } from "@/lib/utils";
import { formatDateTime, formatNumber, initialOf } from "../_lib/format";
import { listConversations, readPageParam, readSearchParam } from "../_lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "会话管理" };

interface ConversationsPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminConversationsPage({ searchParams }: ConversationsPageProps) {
  const params = await searchParams;
  const q = readSearchParam(params.q);
  const page = readPageParam(params.page);
  const data = await listConversations(q, page);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">会话管理</h1>
          <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
            每页 {data.pageSize} 条，按更新时间倒序；详情为只读
          </p>
        </div>

        <form action="/admin/conversations" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="按会话标题搜索"
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
              href="/admin/conversations"
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
            {q ? `没有标题匹配「${q}」的会话。` : "暂无会话数据。"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-4 font-medium">用户</th>
                  <th className="pb-2 pr-4 font-medium">场景</th>
                  <th className="pb-2 pr-4 font-medium">标题</th>
                  <th className="pb-2 pr-4 font-medium">消息数</th>
                  <th className="pb-2 pr-4 font-medium">更新时间</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((conversation) => {
                  const accent = accentOf(conversation.sceneAccent);
                  return (
                    <tr key={conversation.id} className="border-t border-[var(--border)] align-top">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          {conversation.user.image ? (
                            <img
                              src={conversation.user.image}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] object-cover"
                            />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[12.5px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                              {initialOf(conversation.user.name)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{conversation.user.name}</p>
                            <p className="truncate text-[11.5px] text-[var(--muted-foreground)]">
                              {conversation.user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <span className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ${accent.chip}`}>
                          {conversation.sceneName}
                        </span>
                      </td>

                      <td className="max-w-[280px] py-3 pr-4">
                        <p className="truncate">{conversation.title}</p>
                        <p className="truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                          {conversation.id}
                        </p>
                      </td>

                      <td className="py-3 pr-4 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <MessagesSquare className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
                          {formatNumber(conversation.messageCount)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap py-3 pr-4 text-[12.5px] text-[var(--muted-foreground)]">
                        {formatDateTime(conversation.updatedAt)}
                      </td>

                      <td className="py-3">
                        <Link
                          href={`/admin/conversations/${conversation.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11.5px] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        >
                          查看详情
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          basePath="/admin/conversations"
          page={data.page}
          pageCount={data.pageCount}
          total={data.total}
          q={q}
        />
      </section>
    </div>
  );
}
