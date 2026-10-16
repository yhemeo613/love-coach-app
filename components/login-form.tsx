"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HeartHandshake, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { GithubIcon, GoogleIcon } from "@/components/brand-icons";
import { authClient } from "@/lib/auth-client";

const PASSWORD_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ALLOW_PASSWORD_LOGIN === "1";

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/chat";

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  async function social(provider: "github" | "google") {
    setError(null);
    setPending(provider);
    try {
      await authClient.signIn.social({ provider, callbackURL: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请稍后再试。");
      setPending(null);
    }
  }

  async function passwordSignIn() {
    setError(null);
    setPending("password");
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setError(signInError.message || "邮箱或密码不正确。");
      setPending(null);
      return;
    }
    router.push(next);
  }

  async function passwordSignUp() {
    setError(null);
    setPending("signup");
    const { error: signUpError } = await authClient.signUp.email({ email, password, name });
    if (signUpError) {
      setError(signUpError.message || "注册失败。");
      setPending(null);
      return;
    }
    router.push(next);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* 品牌侧 */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-rose-500 via-rose-600 to-rose-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <HeartHandshake className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-[15px] font-semibold tracking-wide">恋爱教练</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-snug">
            把「我不会」变成
            <br />
            「我知道下一步做什么」
          </h1>
          <p className="mt-5 text-[14.5px] leading-7 text-white/85">
            十一个场景化教练：从自我建设、开口、聊天、邀约，到关系维持与冲突处理。
            每个回答都给出可落地、可撤回、可拒绝的具体做法。
          </p>
          <div className="mt-8 space-y-3 text-[13.5px] text-white/80">
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              不编造身份，不施压，不把「没有明确拒绝」当成同意
            </p>
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              对话按账号隔离保存，可随时删除
            </p>
          </div>
        </div>

        <p className="text-[11.5px] text-white/60">
          如遇伤害或危机，请寻求线下专业支持（心理援助热线 12356）
        </p>
      </div>

      {/* 登录侧 */}
      <div className="flex items-center justify-center bg-[var(--background)] px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 text-white">
                <HeartHandshake className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="text-[15px] font-semibold">恋爱教练</span>
            </div>
          </div>

          <h2 className="mt-8 text-xl font-semibold lg:mt-0">登录后开始对话</h2>
          <p className="mt-2 text-[13px] text-[var(--muted-foreground)]">
            使用第三方账号一键登录，我们只读取你的昵称、邮箱与头像。
          </p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => social("github")}
              disabled={pending !== null}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-[14px] font-medium transition hover:border-rose-300 disabled:opacity-60 dark:hover:border-rose-800"
            >
              {pending === "github" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <GithubIcon className="h-4 w-4" />
              )}
              使用 GitHub 登录
            </button>

            {googleEnabled ? (
              <button
                type="button"
                onClick={() => social("google")}
                disabled={pending !== null}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-[14px] font-medium transition hover:border-rose-300 disabled:opacity-60 dark:hover:border-rose-800"
              >
                {pending === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                使用 Google 登录
              </button>
            ) : null}
          </div>

          {PASSWORD_LOGIN_ENABLED ? (
            <div className="mt-7 rounded-xl border border-dashed border-[var(--border)] p-4">
              <p className="text-[12px] font-medium text-[var(--muted-foreground)]">
                内部账号登录（本地联调 / 运营账号，生产环境默认关闭）
              </p>
              <div className="mt-3 space-y-2.5">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="昵称（注册时使用）"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13.5px] outline-none focus:border-rose-400"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="邮箱"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13.5px] outline-none focus:border-rose-400"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码（至少 8 位）"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[13.5px] outline-none focus:border-rose-400"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={passwordSignIn}
                    disabled={pending !== null || !email || !password}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={passwordSignUp}
                    disabled={pending !== null || !email || !password || !name}
                    className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] font-medium transition hover:border-rose-300 disabled:opacity-50"
                  >
                    注册
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-[11.5px] leading-5 text-[var(--muted-foreground)]">
            登录即表示同意：你的对话内容会保存在本服务中，用于展示历史记录与用量统计；
            管理员可在后台查看用于运营与安全审计。可在对话页随时删除单条会话。
          </p>
        </div>
      </div>
    </div>
  );
}
