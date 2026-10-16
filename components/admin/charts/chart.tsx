"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";

/**
 * ECharts 渲染组件（客户端专用：echarts 需要 window）。
 *
 * 注意：本文件带 "use client"，因此**不要把纯函数/常量直接定义在这里**——
 * 服务端组件调用它们会报错。纯逻辑放在 chart-theme.ts，这里只做渲染。
 * 为兼容既有 client 组件的导入写法，这里重新导出主题工具。
 */
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export { CHART_COLORS, CHART_PALETTE, baseOption, categoryAxis, valueAxis } from "./chart-theme";

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[12px] text-[var(--muted-foreground)]"
      style={{ height }}
    >
      图表加载中…
    </div>
  );
}

export interface ChartProps {
  option: EChartsOption;
  height?: number;
  className?: string;
}

export function Chart({ option, height = 260, className }: ChartProps) {
  // 切换数据时不残留上一次的 series
  const style = useMemo(() => ({ height, width: "100%" }), [height]);

  return (
    <div className={className} style={style}>
      <ReactECharts option={option} style={style} notMerge lazyUpdate opts={{ renderer: "canvas" }} />
    </div>
  );
}

export type { EChartsOption };
