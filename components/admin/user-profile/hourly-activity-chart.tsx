"use client";

import type { EChartsOption } from "echarts";
import { formatNumber } from "@/app/admin/_lib/format";
import {
  CHART_COLORS,
  Chart,
  baseOption,
  categoryAxis,
  valueAxis,
} from "@/components/admin/charts/chart";

/**
 * 活跃时段分布：0–23 时柱状图，按北京时间（UTC+8）聚合，
 * 峰值时段用主色实心、其余用 35% 主色，避免整片同色看不出重点。
 */
export function HourlyActivityChart({
  hours,
  peakHour,
}: {
  /** 长度 24，索引即北京时间小时 */
  hours: number[];
  peakHour: number | null;
}) {
  const option: EChartsOption = baseOption({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      valueFormatter: (value: unknown) => `${formatNumber(Number(value ?? 0))} 条消息`,
    },
    grid: { top: 24, right: 18, bottom: 28, left: 44, containLabel: false },
    xAxis: {
      ...categoryAxis,
      data: hours.map((_, hour) => `${hour}`),
      // 24 个刻度只显示偶数小时
      axisLabel: { ...categoryAxis.axisLabel, interval: 1 },
    },
    yAxis: {
      ...valueAxis,
      name: "消息数",
      nameTextStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    series: [
      {
        name: "消息数",
        type: "bar",
        barMaxWidth: 18,
        data: hours.map((count, hour) => ({
          value: count,
          itemStyle: {
            color:
              hour === peakHour && count > 0 ? CHART_COLORS.primary : CHART_COLORS.primarySoft,
            borderRadius: [4, 4, 0, 0],
          },
        })),
      },
    ],
  });

  return <Chart option={option} height={280} />;
}
