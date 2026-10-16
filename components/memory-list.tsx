"use client";

import { useState, useTransition } from "react";
import { Brain, Loader2, Trash2 } from "lucide-react";

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * 长期记忆列表：用户可见、可单条删除、可一键清空。
 * 与后端 /api/memories 对应；删除后本地状态即时更新，无需刷新页面。
 */
export function MemoryList({ initial }: { initial: MemoryItem[] }) {
  const [memories, setMemories] = useState<MemoryItem[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = (id?: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(id ? `/api/memories?id=${encodeURIComponent(id)}` : "/api/memories?all=1", {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMemories((prev) => (id ? prev.filter((item) => item.id !== id) : []));
      } catch {
        setError("删除失败，请稍后重试。");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Brain className="h-4 w-4 text-violet-600" aria-hidden="true" />
          教练记住的事
        </h2>
        {memories.length > 0 ? (
          <button
            type="button"
            onClick={() => remove()}
            disabled={pending}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--muted-foreground)] hover:text-rose-600 disabled:opacity-50"
          >
            全部清空
          </button>
        ) : null}
      </div>

      <p className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
        这些是跨会话生效的长期记忆（关系阶段、目标对象、已给建议等）。发现记错了或不想保留，随时删除。
      </p>

      {error ? <p className="mt-2 text-[12.5px] text-rose-600">{error}</p> : null}

      {memories.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">
          还没有长期记忆。聊得多了，教练会自动记住重要的背景信息。
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {memories.map((memory) => (
            <li
              key={memory.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] p-3"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-violet-600">{memory.key}</p>
                <p className="mt-0.5 text-[13px] leading-5">{memory.value}</p>
                <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">
                  {new Date(memory.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(memory.id)}
                disabled={pending}
                aria-label={`删除记忆：${memory.key}`}
                className="shrink-0 rounded-lg p-1.5 text-[var(--muted-foreground)] hover:text-rose-600 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
