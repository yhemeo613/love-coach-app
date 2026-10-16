// Prisma 7 配置：
//  - 连接串不再写在 schema.prisma 的 datasource 里，统一放这里
//  - Prisma 7 不再自动加载 .env，所以显式 dotenv
//  - 关闭 checkpoint 网络上报（国内直连会长时间等待，这是 prisma 命令"卡住"的主因）
process.env.CHECKPOINT_DISABLE ||= "1";

import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
