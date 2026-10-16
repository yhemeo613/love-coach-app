import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/app/admin/_lib/format";

/**
 * 后台指标卡（服务端组件，纯展示）。
 * value 支持字符串：百分比、负载、区间等格式化后的值可直接传入。
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] text-[var(--muted-foreground)]">{label}</p>
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {hint ? <p className="mt-1 text-[11.5px] text-[var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}
