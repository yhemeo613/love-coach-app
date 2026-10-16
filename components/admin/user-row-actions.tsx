"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Unlock,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** 与 /api/admin/users PATCH 的约定保持一致 */
type AdminUserAction = "set-role" | "ban" | "unban" | "reset-quota";

interface PatchResponse {
  ok?: boolean;
  error?: string;
  message?: string;
}

const BAN_DURATIONS = [
  { value: "0", label: "永久封禁" },
  { value: "1", label: "封禁 1 天" },
  { value: "7", label: "封禁 7 天" },
  { value: "30", label: "封禁 30 天" },
];

const buttonClass =
  "inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11.5px] transition disabled:cursor-not-allowed disabled:opacity-45";

export function UserRowActions({
  userId,
  role,
  banned,
  isSelf,
}: {
  userId: string;
  role: string;
  banned: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<AdminUserAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("0");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function call(action: AdminUserAction, payload: Record<string, unknown> = {}) {
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, ...payload }),
      });
      const data = (await response.json().catch(() => ({}))) as PatchResponse;
      if (!response.ok) {
        setError(data.error || `操作失败（HTTP ${response.status}）`);
        return;
      }
      setNotice(data.message || "操作成功。");
      setBanOpen(false);
      setReason("");
      setDays("0");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络异常，请稍后重试。");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="flex w-[240px] flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => call("set-role", { role: role === "admin" ? "user" : "admin" })}
          className={cn(buttonClass, "hover:border-[var(--primary)] hover:text-[var(--primary)]")}
          title={role === "admin" ? "取消管理员权限" : "设为管理员"}
        >
          {pending === "set-role" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : role === "admin" ? (
            <ShieldOff className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          )}
          {role === "admin" ? "取消管理员" : "设为管理员"}
        </button>

        {banned ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => call("unban")}
            className={cn(buttonClass, "hover:border-emerald-400 hover:text-emerald-600")}
          >
            {pending === "unban" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Unlock className="h-3 w-3" aria-hidden="true" />
            )}
            解封
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || isSelf}
            onClick={() => setBanOpen((open) => !open)}
            title={isSelf ? "不能封禁自己" : "封禁该用户"}
            className={cn(buttonClass, "hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400")}
          >
            <Ban className="h-3 w-3" aria-hidden="true" />
            封禁
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => call("reset-quota")}
          title="删除 Redis 中该用户当日的对话计数"
          className={cn(buttonClass, "hover:border-[var(--primary)] hover:text-[var(--primary)]")}
        >
          {pending === "reset-quota" ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          )}
          重置配额
        </button>
      </div>

      {banOpen && !banned ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2.5">
          <label className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <UserCog className="h-3 w-3" aria-hidden="true" />
            封禁原因（写入审计日志）
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={200}
            placeholder="例如：批量刷接口、辱骂他人"
            className="mt-1.5 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--primary)]"
          />
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--primary)]"
          >
            {BAN_DURATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                call("ban", {
                  reason: reason.trim(),
                  days: Number.parseInt(days, 10) || 0,
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-2 py-1.5 text-[11.5px] font-medium text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
            >
              {pending === "ban" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="h-3 w-3" aria-hidden="true" />
              )}
              确认封禁
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBanOpen(false);
                setReason("");
                setDays("0");
              }}
              className={cn(buttonClass, "justify-center")}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {notice ? <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{notice}</p> : null}
      {error ? <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
