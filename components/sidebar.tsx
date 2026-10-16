"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  LogOut,
  MessageSquarePlus,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { scenes, type Scene } from "@/lib/scenes";
import { accentOf, cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { SceneIcon } from "./scene-icon";

export interface ConversationItem {
  id: string;
  sceneId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

interface SidebarProps {
  user: { id: string; name: string; email: string; image: string | null; role: string };
  activeSceneId: string;
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  onClose?: () => void;
}

function sceneNameOf(sceneId: string): string {
  return scenes.find((s) => s.id === sceneId)?.code ?? "—";
}

export function Sidebar({
  user,
  activeSceneId,
  conversations,
  activeConversationId,
  onSelectScene,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  onClose,
}: SidebarProps) {
  const [showSources, setShowSources] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const activeScene: Scene =
    scenes.find((s) => s.id === activeSceneId) ?? scenes[scenes.length - 1];

  return (
    <aside className="scroll-thin flex h-full w-full flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--card)]/70 px-3 pb-5 pt-4 backdrop-blur">
      <div className="flex items-center justify-between px-1.5">
        <Link href="/chat" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-sm">
            <SceneIcon name="HeartHandshake" className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">恋爱教练</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">场景化对话指导</p>
          </div>
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭目录"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onNewConversation}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:border-rose-300 hover:bg-rose-50/60 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:bg-rose-950/25 dark:hover:text-rose-300"
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        开启新对话
      </button>

      <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-[var(--muted)]/60 p-1 text-[12px]">
        <Link
          href="/chat"
          className="flex-1 rounded-lg px-2 py-1.5 text-center font-medium text-[var(--foreground)]"
        >
          对话
        </Link>
        <Link
          href="/tools"
          className="flex-1 rounded-lg px-2 py-1.5 text-center text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        >
          分析工具
        </Link>
      </div>

      <p className="mt-5 px-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        选择场景
      </p>
      <nav className="mt-2 space-y-1.5">
        {scenes.map((scene) => {
          const active = scene.id === activeScene.id;
          const accent = accentOf(scene.accent);
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelectScene(scene.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition",
                active
                  ? "border-transparent bg-[var(--card)] shadow-sm ring-1 ring-rose-200 dark:ring-rose-900"
                  : "border-transparent hover:bg-[var(--muted)]/70",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  active ? accent.bar : "bg-[var(--muted)]",
                  active ? "text-white" : accent.text,
                )}
              >
                <SceneIcon name={scene.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{scene.name}</span>
                  <span className="shrink-0 rounded bg-[var(--muted)] px-1 text-[10px] font-medium text-[var(--muted-foreground)]">
                    {scene.code}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-4 text-[var(--muted-foreground)]">
                  {scene.tagline}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
        <button
          type="button"
          onClick={() => setShowSources((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            本场景依据
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-[var(--muted-foreground)] transition", showSources && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {showSources ? (
          <div className="mt-2.5 space-y-1.5">
            {activeScene.focus.map((item) => (
              <p key={item} className="text-[11.5px] leading-4 text-[var(--muted-foreground)]">
                · {item}
              </p>
            ))}
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              {activeScene.sources.map((item) => (
                <p key={item} className="text-[11px] leading-4 text-[var(--muted-foreground)]">
                  {item}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-4 px-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        历史对话
      </p>
      <div className="mt-2 space-y-1">
        {conversations.length === 0 ? (
          <p className="px-1.5 text-[11.5px] text-[var(--muted-foreground)]">
            还没有记录，先选一个场景开始。
          </p>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-1.5",
                conversation.id === activeConversationId
                  ? "bg-[var(--muted)]"
                  : "hover:bg-[var(--muted)]/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className="min-w-0 flex-1 truncate text-left text-[12.5px] text-[var(--muted-foreground)]"
                title={conversation.title}
              >
                <span className="mr-1.5 rounded bg-[var(--muted)] px-1 text-[10px]">
                  {sceneNameOf(conversation.sceneId)}
                </span>
                {conversation.title}
              </button>
              <button
                type="button"
                onClick={() => onDeleteConversation(conversation.id)}
                aria-label="删除这条对话"
                className="shrink-0 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 用户区 */}
      <div className="relative mt-auto pt-5">
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] px-2.5 py-2 text-left transition hover:bg-[var(--muted)]/60"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-700 text-[12px] font-medium text-white">
              {user.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium">{user.name}</span>
            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
              {user.role === "admin" ? "管理员" : user.email}
            </span>
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-[var(--muted-foreground)] transition", userMenuOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        {userMenuOpen ? (
          <div className="absolute bottom-[52px] left-0 right-0 z-30 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg">
            {user.role === "admin" ? (
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] transition hover:bg-[var(--muted)]"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                后台管理
              </Link>
            ) : null}
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] transition hover:bg-[var(--muted)]"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              我的账号与用量
            </Link>
            <button
              type="button"
              onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign("/login") } })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition hover:bg-[var(--muted)]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              退出登录
            </button>
          </div>
        ) : null}

        <p className="mt-3 px-0.5 text-[10.5px] leading-4 text-[var(--muted-foreground)]">
          建议仅供参考，不构成医疗或法律意见。如遇伤害或危机，请寻求线下专业支持（心理援助热线 12356）。
        </p>
      </div>
    </aside>
  );
}
