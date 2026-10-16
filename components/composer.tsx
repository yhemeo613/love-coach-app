"use client";

import { useEffect, useRef } from "react";
import { CornerDownLeft, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 输入框高度自适应，最多 8 行
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !streaming && !disabled;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className="border-t border-ink-200 bg-white/80 px-3 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-900/60 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border bg-white px-3 py-2 shadow-soft transition dark:bg-ink-900",
            streaming
              ? "border-brand-300 dark:border-brand-800"
              : "border-ink-200 focus-within:border-brand-400 dark:border-ink-800 dark:focus-within:border-brand-700",
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={placeholder ?? "把你的情况说具体一点：认识多久、线上还是线下、最近一次互动发生了什么……"}
            className="scroll-thin max-h-[200px] min-h-[38px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-ink-800 outline-none placeholder:text-ink-400 disabled:opacity-60 dark:text-ink-100"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="focus-ring mb-0.5 inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 px-3 text-sm text-ink-600 transition hover:border-red-300 hover:text-red-600 dark:border-ink-700 dark:text-ink-300 dark:hover:border-red-800 dark:hover:text-red-400"
            >
              <Square className="h-3.5 w-3.5" />
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className={cn(
                "focus-ring mb-0.5 inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition",
                canSend
                  ? "bg-brand-600 text-white shadow-lift hover:bg-brand-700"
                  : "cursor-not-allowed bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500",
              )}
            >
              <Send className="h-3.5 w-3.5" />
              发送
            </button>
          )}
        </div>
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-ink-400">
          <CornerDownLeft className="h-3 w-3" />
          Enter 发送，Shift + Enter 换行。回复为教练建议，请结合自己的真实情况判断。
        </p>
      </div>
    </div>
  );
}
