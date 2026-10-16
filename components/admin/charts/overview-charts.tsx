import type { EChartsOption } from "echarts";
import { Chart } from "@/components/admin/charts/chart";
import { CHART_COLORS, baseOption, categoryAxis, valueAxis } from "@/components/admin/charts/chart-theme";
import type { OverviewModelSlice, OverviewSceneSlice, OverviewTrendPoint } from "@/app/admin/_lib/queries";

/** 请求量（柱）与 tokens（折线，右轴）双轴趋势 */
export function RequestsTrendChart({ data }: { data: OverviewTrendPoint[] }) {
  const option: EChartsOption = baseOption({
    legend: {
      top: 0,
      right: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    grid: { top: 34, right: 54, bottom: 26, left: 46 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
    },
    xAxis: { ...categoryAxis, data: data.map((point) => point.label) },
    yAxis: [
      { ...valueAxis, name: "请求", nameTextStyle: { fontSize: 11, color: "var(--muted-foreground)" } },
      {
        ...valueAxis,
        name: "tokens",
        nameTextStyle: { fontSize: 11, color: "var(--muted-foreground)" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "请求数",
        type: "bar",
        data: data.map((point) => point.requests),
        barWidth: 18,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: CHART_COLORS.primary },
              { offset: 1, color: "rgba(225,29,72,0.35)" },
            ],
          },
        },
      },
      {
        name: "tokens",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        data: data.map((point) => point.tokens),
        lineStyle: { width: 2, color: CHART_COLORS.sky },
        itemStyle: { color: CHART_COLORS.sky },
        areaStyle: { color: "rgba(14,165,233,0.12)" },
      },
    ],
  });

  return <Chart option={option} height={280} />;
}

/** 场景分布环形图 */
export function SceneDonutChart({ slices }: { slices: OverviewSceneSlice[] }) {
  if (slices.length === 0) {
    return <EmptyChart label="暂无会话数据" />;
  }

  const option: EChartsOption = baseOption({
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      formatter: "{b}<br/>{c} 个会话（{d}%）",
    },
    legend: {
      bottom: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "42%"],
        itemStyle: { borderWidth: 2, borderColor: "var(--card)" },
        label: { show: false },
        data: slices.map((slice) => ({
          name: `${slice.name}（${slice.code}）`,
          value: slice.count,
        })),
      },
    ],
  });

  return <Chart option={option} height={280} />;
}

/** 模型消息占比环形图 */
export function ModelDonutChart({ slices }: { slices: OverviewModelSlice[] }) {
  if (slices.length === 0) {
    return <EmptyChart label="近 7 天暂无模型调用记录" />;
  }

  const option: EChartsOption = baseOption({
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      formatter: "{b}<br/>{c} 条消息（{d}%）",
    },
    legend: {
      bottom: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "42%"],
        itemStyle: { borderWidth: 2, borderColor: "var(--card)" },
        label: { show: false },
        data: slices.map((slice) => ({ name: slice.label, value: slice.messages })),
      },
    ],
  });

  return <Chart option={option} height={280} />;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[12.5px] text-[var(--muted-foreground)]"
      style={{ height: 280 }}
    >
      {label}
    </div>
  );
}
