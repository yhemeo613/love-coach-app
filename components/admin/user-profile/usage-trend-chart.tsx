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
import type { UserProfileTrendPoint } from "./profile-data";

/**
 * 近 30 天用量趋势：requests 与 tokens 双轴折线 + 面积。
 * 数据口径：usage_daily（UTC 自然日），缺失日期已在服务端补 0。
 */
export function UsageTrendChart({ data }: { data: UserProfileTrendPoint[] }) {
  const option: EChartsOption = baseOption({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      valueFormatter: (value: unknown) => formatNumber(Number(value ?? 0)),
    },
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    grid: { top: 46, right: 58, bottom: 28, left: 52, containLabel: false },
    xAxis: {
      ...categoryAxis,
      data: data.map((point) => point.label),
      boundaryGap: false,
      // 30 个刻度全画会糊在一起，交给 ECharts 自动抽稀
      axisLabel: { ...categoryAxis.axisLabel, hideOverlap: true },
    },
    yAxis: [
      {
        ...valueAxis,
        name: "请求数",
        nameTextStyle: { color: "var(--muted-foreground)", fontSize: 11 },
      },
      {
        ...valueAxis,
        name: "Token",
        nameTextStyle: { color: "var(--muted-foreground)", fontSize: 11 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "请求数",
        type: "line",
        yAxisIndex: 0,
        smooth: true,
        showSymbol: false,
        symbolSize: 5,
        data: data.map((point) => point.requests),
        itemStyle: { color: CHART_COLORS.primary },
        lineStyle: { width: 2, color: CHART_COLORS.primary },
        areaStyle: { color: CHART_COLORS.primarySoft },
      },
      {
        name: "Token",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        symbolSize: 5,
        data: data.map((point) => point.tokens),
        itemStyle: { color: CHART_COLORS.sky },
        lineStyle: { width: 2, color: CHART_COLORS.sky },
        areaStyle: { color: "rgba(14, 165, 233, 0.14)" },
      },
    ],
  });

  return <Chart option={option} height={300} />;
}
