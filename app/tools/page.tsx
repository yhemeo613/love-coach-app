import type { Metadata } from "next";
import { ToolsView } from "@/components/tools-view";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "分析工具",
};

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  await requireUser("/login?next=/tools");
  return <ToolsView />;
}
