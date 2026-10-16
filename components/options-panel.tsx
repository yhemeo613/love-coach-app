"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Cpu, Gauge, Loader2, SlidersHorizontal, Wallet, Zap } from "lucide-react";
import { THINKING_MIN_OUTPUT_TOKENS, type ChatRequestOptions } from "@/lib/ai/options";
import { cn } from "@/lib/utils";

export interface ChatSettings {
  model: string;
  thinking: boolean;
  reasoningEffort: "low" | "high" | "max";
  temperature: number;
  topP: number;
  maxTokens: number;
  stopText: string;
  logprobs: boolean;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  model: "",
  thinking: false,
  reasoningEffort: "high",
  temperature: 0.7,
  topP: 1,
  maxTokens: 1600,
  stopText: "",
  logprobs: false,
};

interface ModelsResponse {
  models: Array<{ id: string; label: string; description: string }>;
  fromUpstream: boolean;
  defaultModel: string;
  quota: { minuteUsed: number; dayUsed: number; minuteLimit: number; dayLimit: number };
  totals: { requests: number; cachedTokens: number; promptTokens: number; cacheHitRate: number };
  balance: { available: boolean; currency: string; total: string } | null;
}

const EFFORTS: Array<{ value: ChatSettings["reasoningEffort"]; label: string; hint: string }> = [
  { value: "low", label: "低", hint: "最快，适合简单问题" },
  { value: "high", label: "高", hint: "默认，平衡质量与耗时" },
  { value: "max", label: "最高", hint: "最慢，适合复杂关系分析" },
];

export function OptionsPanel({
  settings,
  onChange,
}: {
  settings: ChatSettings;
  onChange: (next: ChatSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch("/api/ai/models")
      .then((res) => res.json() as Promise<ModelsResponse>)
      .then((json) => {
        setData(json);
        if (!settings.model) onChange({ ...settings, model: json.defaultModel });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  function patch(partial: Partial<ChatSettings>) {
    onChange({ ...settings, ...partial });
  }

  const modelLabel =
    data?.models.find((m) => m.id === settings.model)?.label || settings.model || "默认模型";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 text-[12.5px] text-[var(--muted-foreground)] transition hover:border-rose-300 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:text-rose-400"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{modelLabel}</span>
        {settings.thinking ? (
          <span className="rounded bg-rose-100 px-1 text-[10.5px] text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            思考
          </span>
        ) : null}
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        // 说明：聊天页最外层是 h-screen + overflow-hidden，面板超出的部分会被裁掉，
        // 因此这里按「视口高度 - 顶栏 - 底部输入区」限高，并保证宽度不超出视口
        <div className="scroll-thin absolute right-0 z-30 mt-2 max-h-[calc(100vh-13rem)] w-[min(352px,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-lg">
          {loading ? (
            <p className="flex items-center gap-2 text-[12.5px] text-[var(--muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              正在读取模型列表…
            </p>
          ) : null}

          <section>
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted-foreground)]">
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              模型
            </p>
            {/* 模型多时列表独立滚动，避免把面板撑高到超出视口 */}
            <div className="scroll-thin mt-2 max-h-[28vh] space-y-1.5 overflow-y-auto pr-0.5">
              {(data?.models || [{ id: "deepseek-flash", label: "DeepSeek Flash", description: "" }]).map(
                (model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => patch({ model: model.id })}
                    className={cn(
                      "w-full rounded-lg border px-2.5 py-2 text-left transition",
                      settings.model === model.id
                        ? "border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/25"
                        : "border-[var(--border)] hover:border-rose-200 dark:hover:border-rose-900",
                    )}
                  >
                    <span className="block truncate text-[13px] font-medium">{model.label}</span>
                    {model.description ? (
                      <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-[var(--muted-foreground)]">
                        {model.description}
                      </span>
                    ) : null}
                  </button>
                ),
              )}
            </div>
            {data && !data.fromUpstream ? (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                未能从上游读取模型列表，当前展示内置清单。
              </p>
            ) : null}
          </section>

          <section className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted-foreground)]">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                思考模式
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={settings.thinking}
                onClick={() =>
                  patch(
                    settings.thinking
                      ? { thinking: false }
                      : // 思考模式的推理与正文共享 token 预算，开启时按强度抬高下限
                        {
                          thinking: true,
                          maxTokens: Math.max(
                            settings.maxTokens,
                            THINKING_MIN_OUTPUT_TOKENS[settings.reasoningEffort ?? "high"],
                          ),
                        },
                  )
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition",
                  settings.thinking ? "bg-[var(--primary)]" : "bg-[var(--border)]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition",
                    settings.thinking ? "left-[18px]" : "left-0.5",
                  )}
                />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted-foreground)]">
              开启后模型先推理再作答，过程会折叠展示；更慢，但复杂问题更稳。
            </p>
            {settings.thinking ? (
              <div className="mt-2 flex gap-1.5">
                {EFFORTS.map((effort) => (
                  <button
                    key={effort.value}
                    type="button"
                    title={effort.hint}
                    onClick={() =>
                      patch({
                        reasoningEffort: effort.value,
                        // 强度越高推理越长：切换时同步抬高 token 预算，避免只剩思考没有正文
                        maxTokens: Math.max(
                          settings.maxTokens,
                          THINKING_MIN_OUTPUT_TOKENS[effort.value],
                        ),
                      })
                    }
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition",
                      settings.reasoningEffort === effort.value
                        ? "border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/25"
                        : "border-[var(--border)]",
                    )}
                  >
                    {effort.label}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted-foreground)]">
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              生成参数
            </p>

            <NumberRow
              label="温度 temperature"
              value={settings.temperature}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => patch({ temperature: v })}
              hint="越高越发散；思考模式下不生效"
            />
            <NumberRow
              label="top_p"
              value={settings.topP}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => patch({ topP: v })}
              hint="与温度二选一调整即可；思考模式下有效区间 0.95–1.0"
            />

            <div className="mt-2">
              <span className="flex items-center justify-between">
                <span className="text-[11.5px] text-[var(--muted-foreground)]">最大输出 tokens</span>
                <input
                  type="number"
                  min={64}
                  max={393216}
                  step={128}
                  value={settings.maxTokens}
                  onChange={(e) => patch({ maxTokens: Number(e.target.value) || 1600 })}
                  className="w-24 rounded-md border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-right text-[11.5px] outline-none focus:border-rose-400"
                />
              </span>
              <div className="mt-1 flex gap-1.5">
                {[4096, 16384, 65536, 131072].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => patch({ maxTokens: preset })}
                    className={cn(
                      "flex-1 rounded-md border px-1 py-1 text-[11px] transition",
                      settings.maxTokens === preset
                        ? "border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/25"
                        : "border-[var(--border)]",
                    )}
                  >
                    {preset % 1024 === 0 ? `${preset / 1024}K` : preset}
                  </button>
                ))}
              </div>
              <span className="text-[10.5px] text-[var(--muted-foreground)]">
                上限 384K（393216）；上下文窗口 1M。思考模式推理与正文共享预算：低/高/最高强度分别建议 ≥16K / 32K / 64K（开启思考时自动抬高）。
              </span>
            </div>

            <label className="mt-2 block">
              <span className="text-[11.5px] text-[var(--muted-foreground)]">
                停止序列（逗号分隔，最多 16 个）
              </span>
              <input
                type="text"
                value={settings.stopText}
                onChange={(e) => patch({ stopText: e.target.value })}
                placeholder="例如：---"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-[12.5px] outline-none focus:border-rose-400"
              />
            </label>

            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.logprobs}
                onChange={(e) => patch({ logprobs: e.target.checked })}
                className="h-3.5 w-3.5 accent-rose-600"
              />
              <span className="text-[11.5px] text-[var(--muted-foreground)]">
                返回 token 对数概率（调试用）
              </span>
            </label>
          </section>

          {data ? (
            <section className="mt-4 border-t border-[var(--border)] pt-3">
              <p className="text-[12px] font-medium text-[var(--muted-foreground)]">用量</p>
              <div className="mt-1.5 space-y-1 text-[11.5px] text-[var(--muted-foreground)]">
                <p>
                  本分钟 {data.quota.minuteUsed}/{data.quota.minuteLimit} 次 · 今日 {data.quota.dayUsed}/
                  {data.quota.dayLimit} 次
                </p>
                <p>
                  近 7 天 {data.totals.requests} 次请求 · 缓存命中率{" "}
                  {(data.totals.cacheHitRate * 100).toFixed(1)}%
                </p>
                {data.balance ? (
                  <p className="flex items-center gap-1.5">
                    <Wallet className="h-3 w-3" aria-hidden="true" />
                    账户余额 {data.balance.total} {data.balance.currency}
                    {data.balance.available ? "" : "（不可用）"}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <label className="mt-2.5 block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11.5px] text-[var(--muted-foreground)]">{label}</span>
        <span className="shrink-0 text-[11.5px] font-medium">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-rose-600"
      />
      {hint ? <span className="text-[10.5px] leading-4 text-[var(--muted-foreground)]">{hint}</span> : null}
    </label>
  );
}
