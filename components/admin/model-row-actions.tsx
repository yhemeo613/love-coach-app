"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Power, PowerOff, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  modelId: string;
  enabled: boolean;
  isDefault: boolean;
  label: string;
  note: string;
}

export function ModelRowActions({ modelId, enabled, isDefault, label, note }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label, note });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setPending(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, action, ...extra }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || json.error) {
        setMessage({ kind: "error", text: json.error || "操作失败。" });
        return false;
      }
      setMessage({ kind: "ok", text: json.message || "已更新。" });
      router.refresh();
      return true;
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "网络错误" });
      return false;
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => call(enabled ? "disable" : "enable")}
          disabled={pending !== null}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] transition disabled:opacity-50",
            enabled
              ? "border-[var(--border)] text-[var(--muted-foreground)] hover:border-amber-300 hover:text-amber-700"
              : "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
          )}
        >
          {pending === (enabled ? "disable" : "enable") ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : enabled ? (
            <PowerOff className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Power className="h-3 w-3" aria-hidden="true" />
          )}
          {enabled ? "停用" : "启用"}
        </button>

        <button
          type="button"
          onClick={() => call(isDefault ? "clear-default" : "set-default")}
          disabled={pending !== null}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] transition disabled:opacity-50",
            isDefault
              ? "border-rose-300 bg-rose-50/70 text-rose-700 dark:border-rose-800 dark:bg-rose-950/25 dark:text-rose-300"
              : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-rose-300 hover:text-rose-700",
          )}
        >
          {pending === (isDefault ? "clear-default" : "set-default") ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Star className="h-3 w-3" aria-hidden="true" />
          )}
          {isDefault ? "默认模型" : "设为默认"}
        </button>

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11.5px] text-[var(--muted-foreground)] transition hover:border-rose-300 hover:text-rose-700"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          展示信息
        </button>
      </div>

      {editing ? (
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-2.5">
          <div className="space-y-1.5">
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="展示名称，例如 DeepSeek Flash"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[12px] outline-none focus:border-rose-400"
            />
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="运营备注，例如 促销期主推、限流较严"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[12px] outline-none focus:border-rose-400"
            />
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={async () => {
                const ok = await call("update-meta", { label: form.label, note: form.note });
                if (ok) setEditing(false);
              }}
              disabled={pending !== null}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
            >
              {pending === "update-meta" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3 w-3" aria-hidden="true" />
              )}
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setForm({ label, note });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--muted-foreground)]"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              取消
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          className={cn(
            "text-right text-[11px] leading-4",
            message.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
