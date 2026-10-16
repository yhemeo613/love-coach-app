import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, HeartHandshake, Inbox, MessageSquare, User } from "lucide-react";
import { cn, accentOf } from "@/lib/utils";
import { formatDateTime, formatNumber, humanRole, initialOf } from "../../_lib/format";
import { getConversationDetail } from "../../_lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "会话详情" };

interface ConversationDetailPageProps {
  params: Promise<{ id: string }>;
}

function roleLabel(role: string): string {
  if (role === "user") return "用户";
  if (role === "assistant") return "教练";
  return role;
}

export default async function AdminConversationDetailPage({ params }: ConversationDetailPageProps) {
  const { id } = await params;
  const conversation = await getConversationDetail(id);
  if (!conversation) notFound();

  const accent = accentOf(conversation.sceneAccent);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/conversations"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--muted-foreground)] transition hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          返回会话列表
        </Link>
        <p className="text-[11.5px] text-[var(--muted-foreground)]">只读视图，不提供编辑与删除</p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ${accent.chip}`}>
                {conversation.sceneName}
              </span>
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {conversation.sceneCode}
              </span>
            </div>
            <h1 className="mt-2 text-lg font-semibold tracking-tight">{conversation.title}</h1>
            <p className="mt-1 font-mono text-[11.5px] text-[var(--muted-foreground)]">{conversation.id}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-[var(--muted-foreground)]">消息数</dt>
              <dd className="tabular-nums">{formatNumber(conversation.messages.length)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[var(--muted-foreground)]">总字数</dt>
              <dd className="tabular-nums">{formatNumber(conversation.charTotal)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[var(--muted-foreground)]">创建时间</dt>
              <dd>{formatDateTime(conversation.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[var(--muted-foreground)]">更新时间</dt>
              <dd>{formatDateTime(conversation.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[var(--muted-foreground)]">场景标识</dt>
              <dd className="font-mono text-[11.5px]">{conversation.sceneId}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[var(--border)] pt-4">
          {conversation.user.image ? (
            <img
              src={conversation.user.image}
              alt=""
              className="h-9 w-9 rounded-full border border-[var(--border)] object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-[13px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              {initialOf(conversation.user.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
              {conversation.user.name}
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10.5px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {humanRole(conversation.user.role)}
              </span>
              {conversation.user.banned ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10.5px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  <Ban className="h-3 w-3" aria-hidden="true" />
                  已封禁
                </span>
              ) : null}
            </p>
            <p className="text-[11.5px] text-[var(--muted-foreground)]">{conversation.user.email}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
          完整消息（按时间正序）
        </h2>

        {conversation.messages.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-[13px] text-[var(--muted-foreground)]">
            <Inbox className="h-4 w-4" aria-hidden="true" />
            该会话还没有写入任何消息。
          </p>
        ) : (
          conversation.messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <article
                key={message.id}
                className={cn(
                  "rounded-2xl border p-4 shadow-sm",
                  isUser
                    ? "border-[var(--border)] bg-[var(--muted)]"
                    : "border-[var(--border)] bg-[var(--card)]",
                )}
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[12px] font-medium",
                      isUser ? "text-ink-600 dark:text-ink-300" : "text-[var(--primary)]",
                    )}
                  >
                    {isUser ? (
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {roleLabel(message.role)}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    {formatDateTime(message.createdAt)} · {formatNumber(message.charCount)} 字
                  </span>
                </header>
                <p className="mt-2 whitespace-pre-wrap break-words text-[13.5px] leading-7">
                  {message.content}
                </p>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
