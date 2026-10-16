import type { OverviewSceneSlice } from "@/app/admin/_lib/queries";
import { formatNumber } from "@/app/admin/_lib/format";
import { accentOf } from "@/lib/utils";

/** 场景分布：横向条形，条形宽度按占比计算，中文场景名 + 场景代号 */
export function SceneBars({ slices }: { slices: OverviewSceneSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const max = Math.max(1, ...slices.map((slice) => slice.count));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[15px] font-semibold">场景分布</h2>
        <p className="text-[11.5px] text-[var(--muted-foreground)]">
          共 {formatNumber(total)} 个会话 / {slices.length} 个场景
        </p>
      </div>

      {slices.length === 0 ? (
        <p className="mt-6 text-[13px] text-[var(--muted-foreground)]">暂无会话数据。</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {slices.map((slice) => {
            const accent = accentOf(slice.accent);
            const percent = total > 0 ? Math.round((slice.count / total) * 100) : 0;
            return (
              <li key={slice.sceneId}>
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${accent.chip}`}>
                      {slice.code}
                    </span>
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                    {formatNumber(slice.count)} · {percent}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className={`h-full rounded-full ${accent.bar}`}
                    style={{ width: `${Math.max(2, (slice.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
