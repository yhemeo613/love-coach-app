import { formatNumber } from "@/app/admin/_lib/format";
import type { UserProfileModelRow } from "./profile-data";

/**
 * 模型使用分布：按 message.model 分组的表格（消息数 + token 数）。
 * 用表格而不是图表，是因为该项同时要看三个量（条数、prompt、completion），
 * 表格读数比堆叠柱更直接；空 model（多为 user 角色消息）归并到「未记录」。
 */
export function ModelUsageTable({ rows }: { rows: UserProfileModelRow[] }) {
  const messageTotal = rows.reduce((sum, row) => sum + row.messages, 0);
  const maxMessages = Math.max(1, ...rows.map((row) => row.messages));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="text-[11.5px] text-[var(--muted-foreground)]">
            <th className="pb-2 pr-4 font-medium">模型</th>
            <th className="pb-2 pr-4 font-medium">消息数</th>
            <th className="pb-2 pr-4 font-medium">Prompt tokens</th>
            <th className="pb-2 pr-4 font-medium">Completion tokens</th>
            <th className="pb-2 font-medium">合计 tokens</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const percent = messageTotal > 0 ? Math.round((row.messages / messageTotal) * 100) : 0;
            return (
              <tr
                key={row.model ?? "__unrecorded__"}
                className="border-t border-[var(--border)] align-top"
              >
                <td className="max-w-[240px] py-3 pr-4">
                  <span
                    className={
                      row.model
                        ? "rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                        : "rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11.5px] text-[var(--muted-foreground)]"
                    }
                  >
                    {row.label}
                  </span>
                </td>
                <td className="w-[160px] py-3 pr-4">
                  <div className="flex items-center justify-between gap-2 tabular-nums">
                    <span>{formatNumber(row.messages)}</span>
                    <span className="text-[11.5px] text-[var(--muted-foreground)]">{percent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${Math.max(2, (row.messages / maxMessages) * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="py-3 pr-4 tabular-nums">{formatNumber(row.promptTokens)}</td>
                <td className="py-3 pr-4 tabular-nums">{formatNumber(row.completionTokens)}</td>
                <td className="py-3 tabular-nums">{formatNumber(row.totalTokens)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-[11.5px] leading-5 text-[var(--muted-foreground)]">
        按 message.model 分组，共 {formatNumber(messageTotal)} 条消息。
        角色为 user 的消息通常不写 model 与 token 字段，会归入「未记录」。
      </p>
    </div>
  );
}
