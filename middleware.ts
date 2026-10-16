import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * 只做「乐观重定向」：仅检查会话 cookie 是否存在，不查数据库。
 * 真正的权限校验在页面 / API 里用 auth.api.getSession() 完成（见 lib/session.ts）。
 * 这样中间件保持轻量，也不会因为 DB 抖动导致整站不可用。
 */
const PROTECTED_PREFIXES = ["/chat", "/admin", "/tools"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!needsAuth) return NextResponse.next();

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/admin/:path*", "/tools/:path*", "/admin", "/chat", "/tools"],
};
