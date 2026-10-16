import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 使用 driver adapter。
 *
 * 关键设计：惰性创建客户端。
 * Next.js 构建时会「收集页面数据」，也就是导入路由模块——如果这里在模块作用域
 * 读取 DATABASE_URL 并抛错，构建就会失败（构建期本来也不该连数据库）。
 * 因此导入本模块必须是零副作用的，只有真正执行查询时才建立连接。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let client: PrismaClient | null = null;

function getClient(): PrismaClient {
  if (client) return client;
  if (globalForPrisma.prisma) {
    client = globalForPrisma.prisma;
    return client;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 未配置：请在 .env 中设置数据库连接串后重启服务");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
  });

  client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

/**
 * 对调用方保持 `prisma.user.findMany(...)` 的用法不变，
 * 内部把属性访问与调用转发给惰性创建的真实客户端。
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const instance = getClient();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, property) {
    return property in getClient();
  },
});
