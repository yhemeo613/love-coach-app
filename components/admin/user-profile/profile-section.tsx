import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

/** 画像页统一的分区卡片外壳（服务端组件，纯展示） */
export function ProfileSection({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {Icon ? (
              <Icon className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            ) : null}
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 图表位空态：该用户没有任何消息时不渲染空白图 */
export function EmptyNote({ text = "暂无数据" }: { text?: string }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-10 text-[13px] text-[var(--muted-foreground)]">
      <Inbox className="h-4 w-4" aria-hidden="true" />
      {text}
    </p>
  );
}
