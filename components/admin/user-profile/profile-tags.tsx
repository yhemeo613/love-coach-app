import { ShieldAlert, Sparkles, Target, TriangleAlert, type LucideIcon } from "lucide-react";
import type { UserProfileTag, UserProfileTagTone } from "./profile-data";

/**
 * 自动画像标签：按维度分组的卡片列表，每张卡片给出标签与判定依据。
 * 风险维度排在最前（守护场景 / 封禁属于安全与合规信号，不能埋在最后）。
 */

const TONE_STYLES: Record<
  UserProfileTagTone,
  { card: string; chip: string; label: string; icon: LucideIcon }
> = {
  risk: {
    card: "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/25",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    label: "text-rose-700 dark:text-rose-300",
    icon: ShieldAlert,
  },
  warn: {
    card: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    label: "text-amber-700 dark:text-amber-300",
    icon: TriangleAlert,
  },
  positive: {
    card: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    label: "text-emerald-700 dark:text-emerald-300",
    icon: Sparkles,
  },
  neutral: {
    card: "border-[var(--border)] bg-[var(--muted)]",
    chip: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
    label: "text-[var(--foreground)]",
    icon: Target,
  },
};

const DIMENSION_ORDER = ["风险", "频次", "深度", "偏好", "成本", "习惯", "互动"] as const;

export function ProfileTagList({ tags }: { tags: UserProfileTag[] }) {
  if (tags.length === 0) {
    return <p className="text-[13px] text-[var(--muted-foreground)]">暂无可判定的画像标签。</p>;
  }

  const groups = DIMENSION_ORDER.map((dimension) => ({
    dimension,
    items: tags.filter((tag) => tag.dimension === dimension),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.dimension}>
          <p className="text-[11.5px] font-medium text-[var(--muted-foreground)]">
            {group.dimension}
          </p>
          <div className="mt-2 grid gap-2.5 md:grid-cols-2">
            {group.items.map((tag) => {
              const tone = TONE_STYLES[tag.tone];
              const Icon = tone.icon;
              return (
                <article
                  key={tag.id}
                  className={`rounded-xl border p-3.5 shadow-sm ${tone.card}`}
                >
                  <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${tone.label}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {tag.label}
                    <span
                      className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-normal ${tone.chip}`}
                    >
                      {tag.dimension}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[12px] leading-5 text-[var(--muted-foreground)]">
                    判定依据：{tag.reason}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
