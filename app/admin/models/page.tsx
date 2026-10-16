import type { Metadata } from "next";
import { AlertTriangle, Cpu, Wallet } from "lucide-react";
import { getAdminModels } from "@/app/admin/_lib/models";
import { StatCard } from "@/components/admin/stat-card";
import { ModelRowActions } from "@/components/admin/model-row-actions";
import { Chart } from "@/components/admin/charts/chart";
import { CHART_COLORS, baseOption } from "@/components/admin/charts/chart-theme";
import { formatNumber } from "@/app/admin/_lib/format";
import type { EChartsOption } from "echarts";

export const metadata: Metadata = { title: "模型管理" };
export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const data = await getAdminModels();

  const enabledCount = data.models.filter((m) => m.enabled).length;
  const defaultRow = data.models.find((m) => m.modelId === data.defaultModelId);

  // 各模型 token 占比（环形图）
  const usedModels = data.models.filter((m) => m.tokens7d > 0);
  const shareOption: EChartsOption = baseOption({
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(28,25,23,0.92)",
      borderWidth: 0,
      textStyle: { color: "#fafaf9", fontSize: 12 },
      formatter: "{b}<br/>tokens {c}（{d}%）",
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
        radius: ["52%", "74%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderWidth: 2, borderColor: "var(--card)" },
        label: { show: false },
        data: usedModels.map((m) => ({ name: m.label, value: m.tokens7d })),
      },
    ],
  });

  // 各模型消息数（横向条形）
  const msgOption: EChartsOption = baseOption({
    grid: { top: 12, right: 40, bottom: 12, left: 8, containLabel: true },
    xAxis: { type: "value", axisLabel: { color: "var(--muted-foreground)", fontSize: 11 }, splitLine: { lineStyle: { color: "var(--border)", type: "dashed" } } },
    yAxis: {
      type: "category",
      data: data.models.map((m) => m.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--muted-foreground)", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        data: data.models.map((m) => m.messages7d),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 6, 6, 0], color: CHART_COLORS.primary },
        label: { show: true, position: "right", fontSize: 11, color: "var(--muted-foreground)" },
      },
    ],
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">模型管理</h1>
          <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
            上游模型清单、启用开关、默认模型与真实用量。停用的模型用户端不再可选；默认模型决定未指定时的回落目标。
          </p>
        </div>
        {data.balance ? (
          <p className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12.5px]">
            <Wallet className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
            账户余额 {data.balance.total} {data.balance.currency}
            {data.balance.available ? "" : "（不可用）"}
          </p>
        ) : null}
      </header>

      {!data.upstreamReachable ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[12.5px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          未能从上游读取模型列表（网络或密钥问题），下方列表来自本地配置，可能不是最新。
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="模型总数" value={data.models.length} hint={`启用 ${enabledCount} 个`} />
        <StatCard label="默认模型" value={defaultRow?.label ?? data.defaultModelId} hint={`环境变量默认：${data.envDefaultModel}`} />
        <StatCard label="近 7 天消息" value={formatNumber(data.totals.messages7d)} hint={`tokens ${formatNumber(data.totals.tokens7d)}`} />
        <StatCard
          label="上下文缓存命中"
          value={`${(data.totals.cacheHitRate * 100).toFixed(1)}%`}
          hint={`命中 ${formatNumber(data.totals.cachedTokens7d)} tokens`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Cpu className="h-4 w-4 text-rose-600" aria-hidden="true" />
            各模型 token 占比（近 7 天）
          </h2>
          {usedModels.length > 0 ? (
            <Chart option={shareOption} height={260} />
          ) : (
            <p className="mt-6 text-[13px] text-[var(--muted-foreground)]">近 7 天暂无用量数据。</p>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-[14px] font-semibold">各模型消息数（近 7 天）</h2>
          {data.models.some((m) => m.messages7d > 0) ? (
            <Chart option={msgOption} height={260} />
          ) : (
            <p className="mt-6 text-[13px] text-[var(--muted-foreground)]">近 7 天暂无消息数据。</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">模型清单</h2>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                <th className="px-5 py-2.5 font-medium">模型</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium">近 7 天</th>
                <th className="px-3 py-2.5 font-medium">平均长度</th>
                <th className="px-3 py-2.5 font-medium">备注</th>
                <th className="px-5 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((model) => (
                <tr key={model.modelId} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-5 py-3 align-top">
                    <p className="font-medium">{model.label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--muted-foreground)]">{model.modelId}</p>
                    {!model.upstreamAvailable ? (
                      <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                        上游未返回该模型，可能已下线
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <span
                        className={
                          model.enabled
                            ? "inline-flex w-fit rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "inline-flex w-fit rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]"
                        }
                      >
                        {model.enabled ? "启用中" : "已停用"}
                      </span>
                      {model.isDefault ? (
                        <span className="inline-flex w-fit rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          默认模型
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--muted-foreground)]">
                    <p>{formatNumber(model.messages7d)} 条消息</p>
                    <p>{formatNumber(model.tokens7d)} tokens</p>
                    <p>{model.conversations7d} 个会话</p>
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--muted-foreground)]">
                    {model.avgChars > 0 ? `${model.avgChars} 字/条` : "—"}
                  </td>
                  <td className="max-w-[220px] px-3 py-3 align-top text-[var(--muted-foreground)]">
                    {model.note || "—"}
                  </td>
                  <td className="px-5 py-3 align-top">
                    <ModelRowActions
                      modelId={model.modelId}
                      enabled={model.enabled}
                      isDefault={model.isDefault}
                      label={model.label}
                      note={model.note ?? ""}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
