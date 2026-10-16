/**
 * 后台展示层的格式化工具（纯函数，服务端/客户端都可用，不引入任何依赖）。
 * 约定：所有时间展示都用中文语境，缺失值统一显示「—」。
 */

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 完整时间：2026/10/16 15:04 */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/** 千分位数字 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("zh-CN");
}

/** 运行时长：3 天 4 小时 12 分钟 */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "刚刚启动";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小时`);
  if (minutes > 0) parts.push(`${minutes} 分钟`);
  if (parts.length === 0) parts.push(`${total} 秒`);
  return parts.join(" ");
}

/**
 * 密钥脱敏：sk-124cba40...3301 → sk-12****01
 * 只保留头部 5 位与尾部 2 位，短密钥只保留前 2 位。
 */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "未配置";
  const value = secret.trim();
  if (value.length === 0) return "未配置";
  if (value.length <= 8) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 5)}****${value.slice(-2)}`;
}

/** 昵称首字（兼容 emoji/生僻字的代理对，且界面本身不使用 emoji） */
export function initialOf(name: string | null | undefined, fallback = "用"): string {
  const value = (name ?? "").trim();
  if (value.length === 0) return fallback;
  return Array.from(value)[0] ?? fallback;
}

/** 角色中文名 */
export function humanRole(role: string | null | undefined): string {
  return role === "admin" ? "管理员" : "普通用户";
}

/** 审计动作中文名 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.set-role": "调整角色",
  "user.ban": "封禁用户",
  "user.unban": "解封用户",
  "user.reset-quota": "重置当日配额",
};

export function humanAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** 截断长文本，用于表格里的原因/摘要 */
export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return "—";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
