import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 生成消息 id（浏览器与 Node 环境通用） */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 场景配色到 Tailwind 类的映射（避免动态类名被 purge） */
export const accentStyles: Record<
  string,
  { bar: string; chip: string; ring: string; soft: string; text: string }
> = {
  rose: {
    bar: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    ring: "ring-rose-200 dark:ring-rose-900",
    soft: "bg-rose-50/70 dark:bg-rose-950/20",
    text: "text-rose-600 dark:text-rose-400",
  },
  amber: {
    bar: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-900",
    soft: "bg-amber-50/70 dark:bg-amber-950/20",
    text: "text-amber-600 dark:text-amber-400",
  },
  emerald: {
    bar: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-900",
    soft: "bg-emerald-50/70 dark:bg-emerald-950/20",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  sky: {
    bar: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    ring: "ring-sky-200 dark:ring-sky-900",
    soft: "bg-sky-50/70 dark:bg-sky-950/20",
    text: "text-sky-600 dark:text-sky-400",
  },
  violet: {
    bar: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    ring: "ring-violet-200 dark:ring-violet-900",
    soft: "bg-violet-50/70 dark:bg-violet-950/20",
    text: "text-violet-600 dark:text-violet-400",
  },
  teal: {
    bar: "bg-teal-500",
    chip: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
    ring: "ring-teal-200 dark:ring-teal-900",
    soft: "bg-teal-50/70 dark:bg-teal-950/20",
    text: "text-teal-600 dark:text-teal-400",
  },
  orange: {
    bar: "bg-orange-500",
    chip: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
    ring: "ring-orange-200 dark:ring-orange-900",
    soft: "bg-orange-50/70 dark:bg-orange-950/20",
    text: "text-orange-600 dark:text-orange-400",
  },
  slate: {
    bar: "bg-ink-500",
    chip: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300",
    ring: "ring-ink-200 dark:ring-ink-800",
    soft: "bg-ink-100/70 dark:bg-ink-900/40",
    text: "text-ink-600 dark:text-ink-400",
  },
};

export function accentOf(key: string) {
  return accentStyles[key] ?? accentStyles.slate;
}
