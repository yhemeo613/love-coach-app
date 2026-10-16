"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Cpu, LayoutDashboard, MessagesSquare, Server, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/admin", label: "总览", hint: "用量与趋势", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "用户", hint: "账号与画像", icon: Users },
  { href: "/admin/conversations", label: "会话", hint: "对话审计", icon: MessagesSquare },
  { href: "/admin/models", label: "模型", hint: "启停与用量", icon: Cpu },
  { href: "/admin/ops", label: "运维", hint: "资源与质量", icon: Activity },
  { href: "/admin/system", label: "系统", hint: "依赖与配置", icon: Server },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] transition",
              active
                ? "bg-[var(--primary)] font-medium text-[var(--primary-foreground)]"
                : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col leading-tight">
              <span>{item.label}</span>
              <span
                className={cn(
                  "text-[11px] font-normal",
                  active ? "text-[var(--primary-foreground)]/75" : "text-[var(--muted-foreground)]",
                )}
              >
                {item.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
