import type { EChartsOption } from "echarts";

/**
 * 图表主题与选项工具（**服务端安全**：此文件不能加 "use client"）。
 *
 * 背景：纯函数式的 option 构造必须在服务端组件里也能调用，
 * 否则会报 "Attempted to call baseOption() from the server but baseOption is on the client"。
 * 需要 window 的只有真实渲染组件，见 chart.tsx。
 */

export const CHART_COLORS = {
  primary: "#e11d48",
  primarySoft: "rgba(225, 29, 72, 0.16)",
  amber: "#f59e0b",
  emerald: "#10b981",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  orange: "#f97316",
  slate: "#78716c",
};

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.sky,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.violet,
  CHART_COLORS.teal,
  CHART_COLORS.orange,
  CHART_COLORS.slate,
];

/** 统一 base option：字体、提示框、网格 */
export function baseOption(overrides: Partial<EChartsOption> = {}): EChartsOption {
  return {
    color: CHART_PALETTE,
    textStyle: {
      fontFamily:
        'Inter, -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      fontSize: 12,
    },
    grid: { top: 32, right: 18, bottom: 28, left: 46, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
    },
    ...overrides,
  };
}

/** 分类轴默认样式（隐藏轴线、弱化刻度） */
export const categoryAxis = {
  type: "category" as const,
  axisTick: { show: false },
  axisLine: { lineStyle: { color: "var(--border)" } },
  axisLabel: { color: "var(--muted-foreground)", fontSize: 11 },
};

/** 数值轴默认样式（虚线网格） */
export const valueAxis = {
  type: "value" as const,
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: "var(--muted-foreground)", fontSize: 11 },
  splitLine: { lineStyle: { color: "var(--border)", type: "dashed" as const } },
};
