import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { admin } from "better-auth/plugins";
import { redisStorage } from "@better-auth/redis-storage";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { redis } from "./redis";

/** 管理员邮箱白名单：命中即赋予 admin 角色（逗号分隔） */
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_SITE_NAME || "恋爱教练",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // 会话与限流计数走 Redis，避免高频读写打到 Postgres
  secondaryStorage: redisStorage({ client: redis, keyPrefix: "ba:" }),

  emailAndPassword: {
    // 默认关闭。设为 1 可开启邮箱密码登录（内部账号 / 本地联调使用）
    enabled: process.env.ALLOW_PASSWORD_LOGIN === "1",
    minPasswordLength: 8,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 天
    updateAge: 60 * 60 * 24, // 每天续期一次
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    database: { joins: true },
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },

  // 登录速率限制：借助 Redis 二级存储做计数
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    storage: "secondary-storage",
    customRules: {
      "/sign-in/social": { window: 60, max: 20 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // 白名单邮箱首次登录即成为管理员
          if (isAdminEmail(user.email)) {
            return { data: { ...user, role: "admin" } };
          }
          return { data: user };
        },
      },
    },
  },

  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    nextCookies(), // 必须是最后一个插件
  ],
});

export type Session = typeof auth.$Infer.Session;
