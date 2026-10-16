import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  banned?: boolean | null;
}

/** 读取当前会话用户；未登录返回 null */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & { role?: string; banned?: boolean | null };
  return {
    id: user.id,
    name: user.name ?? "用户",
    email: user.email ?? "",
    image: user.image ?? null,
    role: user.role ?? "user",
    banned: user.banned ?? false,
  };
}

/** 页面级守卫：未登录跳转登录页 */
export async function requireUser(redirectTo = "/login"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(redirectTo);
  return user;
}

/** 管理页守卫：非管理员跳回首页 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}

/** API 守卫：返回用户或 null（由调用方决定返回 401/403） */
export async function getApiUser(): Promise<CurrentUser | null> {
  return getCurrentUser();
}
