"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCopy,
  FileSearch,
  Loader2,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Signal {
  label: string;
  reading: "positive" | "neutral" | "negative";
  evidence: string;
}

interface Report {
  stage: string;
  stageName: string;
  summary: string;
  signals: Signal[];
  risks: string[];
  nextActions: Array<{ action: string; sample?: string }>;
  boundaryNote: string;
}

const READING_STYLE: Record<Signal["reading"], string> = {
  positive: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-950/20",
  neutral: "border-[var(--border)] bg-[var(--muted)]/50",
  negative: "border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/20",
};

const READING_LABEL: Record<Signal["reading"], string> = {
  positive: "正向",
  neutral: "中性",
  negative: "需警惕",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* 剪贴板不可用 */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
    >
      <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function ToolsView() {
  const [transcript, setTranscript] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [completion, setCompletion] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setReport(null);
    try {
      const res = await fetch("/api/tools/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const json = (await res.json()) as { report?: Report; error?: string };
      if (!res.ok || !json.report) {
        setAnalyzeError(json.error || "分析失败，请稍后重试。");
        return;
      }
      setReport(json.report);
    } catch (error) {
      setAnalyzeError(error instanceof Error ? error.message : "网络错误");
    } finally {
      setAnalyzing(false);
    }
  }

  async function complete() {
    setContinuing(true);
    setContinueError(null);
    setCompletion("");
    try {
      const res = await fetch("/api/tools/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prefix, suffix: suffix || undefined }),
      });
      const json = (await res.json()) as { completion?: string; error?: string };
      if (!res.ok) {
        setContinueError(json.error || "补全失败。");
        return;
      }
      setCompletion(json.completion || "");
    } catch (error) {
      setContinueError(error instanceof Error ? error.message : "网络错误");
    } finally {
      setContinuing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          返回对话
        </Link>

        <h1 className="mt-4 text-xl font-semibold">分析工具</h1>
        <p className="mt-1.5 text-[13px] text-[var(--muted-foreground)]">
          两个把大模型能力用在具体环节上的工具：一段聊天记录换一份结构化诊断，一行开头换一句可发送的话。
        </p>

        {/* 聊天记录分析 */}
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <FileSearch className="h-4 w-4 text-rose-600" aria-hidden="true" />
            聊天记录分析
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--muted-foreground)]">
            粘贴你与对方的聊天记录（可脱敏，把名字换成 A / B）。模型会按阶段、信号、风险、下一步四条线给出结构化诊断，
            并引用记录中的原话作为依据。
          </p>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={8}
            placeholder={"示例：\n我：这周末有个展，要一起去吗？\n她：这周有点忙，下次吧\n我：好的，那你忙完告诉我\n她：嗯嗯"}
            className="scroll-thin mt-3 w-full resize-y rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-[13.5px] leading-6 outline-none focus:border-rose-400"
          />

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={analyze}
              disabled={analyzing || transcript.trim().length < 20}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-medium transition",
                analyzing || transcript.trim().length < 20
                  ? "cursor-not-allowed bg-[var(--muted)] text-[var(--muted-foreground)]"
                  : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
              )}
            >
              {analyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              生成诊断
            </button>
            <span className="text-[11.5px] text-[var(--muted-foreground)]">
              {transcript.length} / 12000 字
            </span>
          </div>

          {analyzeError ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {analyzeError}
            </p>
          ) : null}

          {report ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-4">
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  当前阶段 · {report.stage} {report.stageName}
                </p>
                <p className="mt-2 text-[13.5px] leading-6">{report.summary}</p>
              </div>

              {report.signals.length > 0 ? (
                <div>
                  <p className="text-[12px] font-medium text-[var(--muted-foreground)]">信号读数</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {report.signals.map((signal, index) => (
                      <div
                        key={index}
                        className={cn("rounded-xl border p-3", READING_STYLE[signal.reading])}
                      >
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          {signal.label}
                          <span className="rounded bg-black/5 px-1 text-[10.5px] dark:bg-white/10">
                            {READING_LABEL[signal.reading]}
                          </span>
                        </p>
                        <p className="mt-1.5 text-[12px] leading-5 text-[var(--muted-foreground)]">
                          {signal.evidence}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {report.risks.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/70 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-800 dark:text-amber-200">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    风险提示
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {report.risks.map((risk, index) => (
                      <li
                        key={index}
                        className="text-[12.5px] leading-5 text-amber-800 dark:text-amber-200"
                      >
                        · {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.nextActions.length > 0 ? (
                <div>
                  <p className="text-[12px] font-medium text-[var(--muted-foreground)]">下一步</p>
                  <ul className="mt-2 space-y-2">
                    {report.nextActions.map((action, index) => (
                      <li key={index} className="rounded-xl border border-[var(--border)] p-3">
                        <p className="text-[13px] leading-6">{action.action}</p>
                        {action.sample ? (
                          <div className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--muted)]/60 p-2.5">
                            <p className="flex-1 text-[12.5px] leading-5">{action.sample}</p>
                            <CopyButton text={action.sample} />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-[11.5px] leading-5 text-[var(--muted-foreground)]">
                {report.boundaryNote}
              </p>
            </div>
          ) : null}
        </section>

        {/* 话术接龙 */}
        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Wand2 className="h-4 w-4 text-rose-600" aria-hidden="true" />
            话术接龙
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--muted-foreground)]">
            写下你要说的话的开头，模型续写后半句。基于上游 FIM（Fill In the Middle）补全接口，
            属于 Beta 能力；若你的账号未开放会明确提示，不影响其他功能。
          </p>

          <div className="mt-3 space-y-2.5">
            <label className="block">
              <span className="text-[11.5px] text-[var(--muted-foreground)]">开头（必填）</span>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="例如：她说明天有空，我打算回复：那"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-[13.5px] outline-none focus:border-rose-400"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] text-[var(--muted-foreground)]">
                后缀（可选，用于「中间填空」）
              </span>
              <input
                type="text"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="例如：，你看几点方便？"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-[13.5px] outline-none focus:border-rose-400"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={complete}
              disabled={continuing || prefix.trim().length === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-medium transition",
                continuing || prefix.trim().length === 0
                  ? "cursor-not-allowed bg-[var(--muted)] text-[var(--muted-foreground)]"
                  : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
              )}
            >
              {continuing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              续写
            </button>
            <span className="text-[11.5px] text-[var(--muted-foreground)]">
              续写结果仅供改写参考，发送前请自己读一遍
            </span>
          </div>

          {continueError ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {continueError}
            </p>
          ) : null}

          {completion ? (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 p-3.5">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[13.5px] leading-6 whitespace-pre-wrap">
                  {prefix}
                  <span className="rounded bg-rose-100 px-0.5 font-medium dark:bg-rose-950/60">
                    {completion}
                  </span>
                  {suffix}
                </p>
                <CopyButton text={`${prefix}${completion}${suffix}`} />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
