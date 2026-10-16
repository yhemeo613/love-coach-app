import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, HeartHandshake, ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/session";
import { humanRole, initialOf } from "./_lib/format";

export const metadata: Metadata = {
  title: {
    default: "管理后台",
    template: "%s · 管理后台",
  },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-[var(--background)] lg:flex">
      {/* 左侧固定导航 */}
      <aside className="border-b border-[var(--border)] bg-[var(--card)] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[14px] font-semibold">管理后台</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">恋爱教练 · 运营与审计</span>
          </span>
        </div>

        <AdminNav />

        <div className="hidden px-5 py-4 lg:block">
          <p className="flex items-start gap-1.5 rounded-xl bg-[var(--muted)] p-3 text-[11px] leading-5 text-[var(--muted-foreground)]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            所有管理操作都会写入审计日志，包含操作者、动作、对象与来源 IP。
          </p>
        </div>
      </aside>

      {/* 右侧内容区 */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)]/95 px-5 py-3 backdrop-blur">
          <p className="text-[12.5px] text-[var(--muted-foreground)]">
            当前管理员：
            <span className="font-medium text-[var(--foreground)]">{admin.name}</span>
            <span className="ml-2 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              {humanRole(admin.role)}
            </span>
          </p>

          <div className="flex items-center gap-3">
            {admin.image ? (
              // 头像来自 OAuth 提供方，用原生 img 避免为后台单独维护远程域名白名单
              <img
                src={admin.image}
                alt=""
                className="h-8 w-8 rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-[12.5px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {initialOf(admin.name, "管")}
              </span>
            )}
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-[12.5px] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              返回对话
            </Link>
          </div>
        </header>

        <main className="px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
