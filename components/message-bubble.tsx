"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight,
  Brain,
  Sparkle,
  TriangleAlert,
  User,
  Wrench,
} from "lucide-react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "检索场景知识",
  save_action_plan: "生成行动清单",
  set_followup_reminder: "设置跟进提醒",
  get_user_context: "读取历史上下文",
  escalate_to_support: "切换到支持模式",
};

function toolLabel(type: string): string {
  const name = type.replace(/^tool-/, "").replace(/^dynamic-tool$/, "");
  return TOOL_LABELS[name] || name || "工具调用";
}

interface PartLike {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  toolName?: string;
}

export function MessageBubble({
  message,
  streaming,
  sceneChip,
}: {
  message: UIMessage;
  streaming?: boolean;
  sceneChip?: string;
}) {
  const parts = (message.parts ?? []) as PartLike[];
  const isUser = message.role === "user";

  if (isUser) {
    const text = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");
    return (
      <div className="flex animate-fade-up justify-end gap-3">
        <div className="max-w-[min(100%,42rem)] rounded-2xl rounded-br-md bg-[var(--primary)] px-4 py-3 text-[15px] leading-7 text-[var(--primary-foreground)] shadow-sm">
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]">
          <User className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const textParts = parts.filter((p) => p.type === "text" && p.text);
  const reasoningParts = parts.filter((p) => p.type === "reasoning" && p.text);
  const toolParts = parts.filter((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool");
  const lastIndex = parts.length - 1;

  return (
    <div className="flex animate-fade-up gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-sm">
        <Sparkle className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-[min(100%,46rem)]">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted-foreground)]">恋爱教练</span>
          {sceneChip ? (
            <span className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]">
              {sceneChip}
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          {reasoningParts.length > 0 ? (
            <ReasoningBlock text={reasoningParts.map((p) => p.text).join("")} streaming={streaming} />
          ) : null}

          {toolParts.map((part, index) => (
            <ToolCard key={`${part.type}-${index}`} part={part} />
          ))}

          {textParts.length > 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5 shadow-sm">
              <div className="coach-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {textParts.map((p) => p.text).join("")}
                </ReactMarkdown>
                {streaming && parts[lastIndex]?.type === "text" ? (
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-blink bg-[var(--primary)] align-middle" />
                ) : null}
              </div>
            </div>
          ) : streaming && toolParts.length === 0 && reasoningParts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[13px] text-[var(--muted-foreground)]">
              <span className="inline-block h-4 w-[2px] animate-blink bg-[var(--primary)]" />
              正在思考…
            </div>
          ) : null}

          {/* 思考模式的推理与正文共享 token 预算：预算耗尽时会只有思考没有正文 */}
          {!streaming && reasoningParts.length > 0 && textParts.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[12.5px] leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              本次输出被 token 上限截断，只产生了思考过程、没有正文。请在右上角参数面板调高「最大输出
              tokens」（建议 8K 以上），或关闭思考模式后重试。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 思考过程：默认折叠，符合「思考模式」的成本与噪音控制 */
function ReasoningBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Brain className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
        <span className="text-[12px] font-medium text-[var(--muted-foreground)]">
          思考过程{streaming ? "（生成中）" : ""}
        </span>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
          {open ? "收起" : `${text.length} 字`}
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-[var(--muted-foreground)] transition",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="scroll-thin max-h-72 overflow-y-auto border-t border-[var(--border)] px-3 py-2.5 text-[12.5px] leading-6 whitespace-pre-wrap text-[var(--muted-foreground)]">
          {text}
        </div>
      ) : null}
    </div>
  );
}

/** 工具调用：让用户看到教练「真的做了什么」，而不是假装 */
function ToolCard({ part }: { part: PartLike }) {
  const [open, setOpen] = useState(false);
  const label = toolLabel(part.toolName || part.type);
  const done = part.state === "output-available" || Boolean(part.output);
  const failed = part.state === "output-error";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        failed
          ? "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20"
          : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-950/20",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Wrench
          className={cn(
            "h-3.5 w-3.5",
            failed ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
          )}
          aria-hidden="true"
        />
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {failed ? "执行失败" : done ? "已完成" : "执行中…"}
        </span>
        <ChevronRight
          className={cn("ml-auto h-3.5 w-3.5 text-[var(--muted-foreground)] transition", open && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5 border-t border-black/5 pt-2 dark:border-white/10">
          {part.input ? (
            <pre className="scroll-thin max-h-32 overflow-auto rounded-lg bg-black/5 p-2 text-[11.5px] leading-5 dark:bg-white/5">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          ) : null}
          {part.output ? (
            <pre className="scroll-thin max-h-40 overflow-auto rounded-lg bg-black/5 p-2 text-[11.5px] leading-5 dark:bg-white/5">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex animate-fade-up gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-[min(100%,46rem)] rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[13.5px] leading-6 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
        {message}
      </div>
    </div>
  );
}
