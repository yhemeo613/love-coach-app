import Link from "next/link";
import { Inbox } from "lucide-react";

/** 用户 id 不存在时的中文提示（保留在后台布局内） */
export default function UserProfileNotFound() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Inbox className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
        用户不存在
      </p>
      <p className="mt-2 text-[12.5px] text-[var(--muted-foreground)]">
        该账号可能已被删除，或 id 不正确。
      </p>
      <Link
        href="/admin/users"
        className="mt-4 inline-flex items-center rounded-xl border border-[var(--border)] px-3 py-1.5 text-[12.5px] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
      >
        返回用户列表
      </Link>
    </div>
  );
}
