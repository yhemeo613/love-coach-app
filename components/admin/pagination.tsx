import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/app/admin/_lib/format";

/**
 * 分页：保留 ?q= 搜索条件，只在第 1 页省略 page 参数，保证链接干净。
 * 纯服务端组件，不依赖任何客户端状态。
 */
export function Pagination({
  basePath,
  page,
  pageCount,
  total,
  q,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  q: string;
}) {
  const hrefOf = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  const linkClass =
    "inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12.5px] transition";
  const disabledClass = "pointer-events-none opacity-40";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12px] text-[var(--muted-foreground)]">
        共 {formatNumber(total)} 条 · 第 {page} / {pageCount} 页
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={hrefOf(page - 1)}
          aria-disabled={!hasPrev}
          className={cn(
            linkClass,
            !hasPrev ? disabledClass : "hover:border-[var(--primary)] hover:text-[var(--primary)]",
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          上一页
        </Link>
        <Link
          href={hrefOf(page + 1)}
          aria-disabled={!hasNext}
          className={cn(
            linkClass,
            !hasNext ? disabledClass : "hover:border-[var(--primary)] hover:text-[var(--primary)]",
          )}
        >
          下一页
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
