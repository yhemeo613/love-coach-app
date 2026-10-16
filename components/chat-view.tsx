"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Menu, RotateCcw, Sparkle, TriangleAlert, Wand2 } from "lucide-react";
import { DEFAULT_SCENE_ID, scenes } from "@/lib/scenes";
import { accentOf, cn } from "@/lib/utils";
import { Composer } from "./composer";
import { ErrorNotice, MessageBubble } from "./message-bubble";
import { DEFAULT_SETTINGS, OptionsPanel, type ChatSettings } from "./options-panel";
import { SceneIcon } from "./scene-icon";
import { Sidebar, type ConversationItem } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

interface Props {
  user: { id: string; name: string; email: string; image: string | null; role: string };
}

export function ChatView({ user }: Props) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState(DEFAULT_SCENE_ID);
  const [input, setInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sceneIdRef = useRef(sceneId);
  const conversationIdRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  sceneIdRef.current = sceneId;
  conversationIdRef.current = activeId;
  settingsRef.current = settings;

  /* ---------- 传输层：每次请求都带上当前场景/会话/模型参数 ---------- */
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          const s = settingsRef.current;
          const stop = s.stopText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 16);
          return {
            sceneId: sceneIdRef.current,
            conversationId: conversationIdRef.current ?? undefined,
            model: s.model || undefined,
            thinking: s.thinking,
            reasoningEffort: s.reasoningEffort,
            temperature: s.temperature,
            topP: s.topP,
            maxTokens: s.maxTokens,
            stop: stop.length > 0 ? stop : undefined,
            logprobs: s.logprobs,
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, error, regenerate } = useChat({
    transport,
  });

  const busy = status === "submitted" || status === "streaming";
  const scene = useMemo(
    () => scenes.find((s) => s.id === sceneId) ?? scenes[scenes.length - 1],
    [sceneId],
  );
  const accent = accentOf(scene.accent);

  /* ---------- 会话列表 ---------- */
  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const json = (await res.json()) as { conversations: ConversationItem[] };
      setConversations(json.conversations);
    } catch {
      /* 忽略网络抖动 */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const json = (await res.json()) as { conversations: ConversationItem[] };
      setConversations(json.conversations);
      if (json.conversations.length > 0) {
        const first = json.conversations[0];
        setActiveId(first.id);
        setSceneId(first.sceneId);
        await loadMessages(first.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingConversation(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) {
        setMessages([]);
        return;
      }
      const json = (await res.json()) as { messages: UIMessage[] };
      setMessages(json.messages ?? []);
    } finally {
      setLoadingConversation(false);
    }
  }, [setMessages]);

  const createConversation = useCallback(async (nextSceneId: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId: nextSceneId }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { conversation: { id: string } };
      return json.conversation.id;
    } catch {
      return null;
    }
  }, []);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeId) {
        setDrawerOpen(false);
        return;
      }
      stop();
      const target = conversations.find((c) => c.id === id);
      if (target) setSceneId(target.sceneId);
      setActiveId(id);
      setInput("");
      setDrawerOpen(false);
      await loadMessages(id);
    },
    [activeId, conversations, loadMessages, stop],
  );

  const handleNewConversation = useCallback(async () => {
    stop();
    const id = await createConversation(sceneId);
    if (!id) {
      setNotice("创建会话失败，请稍后重试。");
      return;
    }
    setActiveId(id);
    setMessages([]);
    setInput("");
    setDrawerOpen(false);
    await refreshConversations();
  }, [createConversation, refreshConversations, sceneId, setMessages, stop]);

  const handleSelectScene = useCallback(
    async (nextSceneId: string) => {
      setDrawerOpen(false);
      stop();
      // 场景即会话主题：切场景就开新会话，避免历史被跨场景污染
      const id = await createConversation(nextSceneId);
      setSceneId(nextSceneId);
      if (id) {
        setActiveId(id);
        setMessages([]);
        setInput("");
        await refreshConversations();
      }
    },
    [createConversation, refreshConversations, setMessages, stop],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch {
        /* 忽略 */
      }
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (id === activeId) {
        const next = remaining[0];
        if (next) {
          setActiveId(next.id);
          setSceneId(next.sceneId);
          await loadMessages(next.id);
        } else {
          setActiveId(null);
          setMessages([]);
        }
      }
      await refreshConversations();
    },
    [activeId, conversations, loadMessages, refreshConversations, setMessages],
  );

  const handleClearCurrent = useCallback(() => {
    stop();
    setMessages([]);
    setNotice("已清空当前视图。服务器端历史仍保留，可在左侧重新打开。");
  }, [setMessages, stop]);

  /* ---------- 发送 ---------- */
  const handleSend = useCallback(
    async (text?: string) => {
      const value = (text ?? input).trim();
      if (!value || busy) return;
      setNotice(null);
      setInput("");

      // 首次发送前先把会话建好，保证服务端能正确归集消息
      if (!conversationIdRef.current) {
        const id = await createConversation(sceneIdRef.current);
        if (!id) {
          setNotice("创建会话失败，请检查登录状态或稍后重试。");
          return;
        }
        conversationIdRef.current = id;
        setActiveId(id);
      }

      void sendMessage({ text: value });
    },
    [busy, createConversation, input, sendMessage],
  );

  // 一轮结束后刷新左侧列表（标题与时间会变化）
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") void refreshConversations();
    prevStatus.current = status;
  }, [refreshConversations, status]);

  /* ---------- 自动滚动 ---------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [messages, busy]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <div className="hidden w-[292px] shrink-0 lg:block">
        <Sidebar
          user={user}
          activeSceneId={sceneId}
          conversations={conversations}
          activeConversationId={activeId}
          onSelectScene={handleSelectScene}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onNewConversation={handleNewConversation}
        />
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[330px] bg-[var(--card)] shadow-xl">
            <Sidebar
              user={user}
              activeSceneId={sceneId}
              conversations={conversations}
              activeConversationId={activeId}
              onSelectScene={handleSelectScene}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onNewConversation={handleNewConversation}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* relative + z-index：为顶栏建立独立层叠上下文，否则设置面板等绝对定位子元素会被后面的消息区盖住 */}
        <header className="relative z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/85 px-3 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开场景目录"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted-foreground)] lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                accent.bar,
              )}
            >
              <SceneIcon name={scene.icon} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[15px] font-semibold">{scene.name}</h1>
                <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium", accent.chip)}>
                  {scene.code}
                </span>
              </div>
              <p className="truncate text-[12px] text-[var(--muted-foreground)]">{scene.tagline}</p>
            </div>
          </div>

          {messages.length > 0 ? (
            <button
              type="button"
              onClick={handleClearCurrent}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 text-[12.5px] text-[var(--muted-foreground)] transition hover:border-rose-300 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:text-rose-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">清空视图</span>
            </button>
          ) : null}
          <OptionsPanel settings={settings} onChange={setSettings} />
          <ThemeToggle />
        </header>

        <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {notice ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/60 px-3 py-2 text-[12.5px] text-[var(--muted-foreground)]">
                {notice}
              </div>
            ) : null}

            {loadingConversation ? (
              <p className="flex items-center gap-2 pt-6 text-[13px] text-[var(--muted-foreground)]">
                <Sparkle className="h-4 w-4 animate-pulse" aria-hidden="true" />
                正在载入历史对话…
              </p>
            ) : messages.length === 0 ? (
              <IntroScene
                sceneName={scene.name}
                code={scene.code}
                description={scene.description}
                starters={scene.starters}
                accentKey={scene.accent}
                onPick={(text) => void handleSend(text)}
                disabled={busy}
              />
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={message.id || index}
                  message={message}
                  streaming={busy && index === messages.length - 1 && message.role === "assistant"}
                  sceneChip={message.role === "assistant" ? scene.code : undefined}
                />
              ))
            )}

            {error ? (
              <div className="space-y-2">
                <ErrorNotice
                  message={error.message || "请求失败，请检查登录状态、配额或服务端配置。"}
                />
                <button
                  type="button"
                  onClick={() => void regenerate()}
                  className="ml-11 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--muted-foreground)] transition hover:border-rose-300 hover:text-rose-700"
                >
                  重新生成
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void handleSend()}
          onStop={() => void stop()}
          streaming={busy}
        />
      </div>
    </div>
  );
}

function IntroScene({
  sceneName,
  code,
  description,
  starters,
  accentKey,
  onPick,
  disabled,
}: {
  sceneName: string;
  code: string;
  description: string;
  starters: string[];
  accentKey: string;
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  const accent = accentOf(accentKey);
  return (
    <div className="animate-fade-up pt-6">
      <div className={cn("rounded-2xl border border-[var(--border)] p-5", accent.soft)}>
        <div className="flex items-center gap-2">
          <Sparkle className={cn("h-4 w-4", accent.text)} aria-hidden="true" />
          <span className="text-[12px] font-medium text-[var(--muted-foreground)]">
            当前场景 {code}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">{sceneName}</h2>
        <p className="mt-2 text-[13.5px] leading-6 text-[var(--muted-foreground)]">{description}</p>
      </div>

      <div className="mt-5 flex items-center gap-2 text-[12.5px] text-[var(--muted-foreground)]">
        <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
        不知道怎么开口？点一句直接开始
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            disabled={disabled}
            onClick={() => onPick(starter)}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-left text-[13.5px] leading-5 transition hover:-translate-y-0.5 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-rose-800"
          >
            {starter}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/20">
        <TriangleAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <p className="text-[12px] leading-5 text-amber-800 dark:text-amber-200">
          教练只给可落地、可撤回、可拒绝的建议：不编造身份，不施压，不把「没有明确拒绝」当成同意。
          若你正遭遇反复贬低或忽冷忽热的拉扯，请切到「守护 · 被操控 / 被拉扯」场景。
        </p>
      </div>
    </div>
  );
}
