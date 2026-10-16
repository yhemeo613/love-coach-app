"use client";

import type { EChartsOption } from "echarts";
import { formatNumber } from "@/app/admin/_lib/format";
import {
  CHART_PALETTE,
  Chart,
  baseOption,
} from "@/components/admin/charts/chart";
import type { UserProfileSceneSlice } from "./profile-data";

/**
 * 场景偏好：环形饼图，图例与提示都用「场景代号 + 中文场景名」。
 * 配色统一走 CHART_PALETTE（图表入口文件已与设计 token 对齐）。
 */
export function SceneMixChart({ slices }: { slices: UserProfileSceneSlice[] }) {
  const option: EChartsOption = baseOption({
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      formatter: "{b}<br/>{c} 个会话（{d}%）",
    },
    legend: {
      orient: "vertical",
      right: 4,
      top: "middle",
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["34%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "var(--card)", borderWidth: 2 },
        label: {
          color: "var(--muted-foreground)",
          fontSize: 11,
          formatter: "{d}%",
        },
        labelLine: { length: 8, length2: 8 },
        data: slices.map((slice, index) => ({
          name: `${slice.code} ${slice.name}`,
          value: slice.count,
          itemStyle: { color: CHART_PALETTE[index % CHART_PALETTE.length] },
        })),
      },
    ],
  });

  return (
    <div>
      <Chart option={option} height={280} />
      <ul className="mt-2 space-y-1.5 border-t border-[var(--border)] pt-3">
        {slices.map((slice, index) => (
          <li key={slice.sceneId} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }}
                aria-hidden="true"
              />
              <span className="truncate">
                {slice.code} {slice.name}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
              {formatNumber(slice.count)} 个 · {slice.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
