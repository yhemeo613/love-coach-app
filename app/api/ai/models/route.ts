import { getCurrentUser } from "@/lib/session";
import { getBalance, listModels } from "@/lib/ai/models";
import { getUsage, LIMITS } from "@/lib/redis";
import { getUsageTotals } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const [{ models, fromUpstream }, quota, totals] = await Promise.all([
    listModels(),
    getUsage(user.id),
    getUsageTotals(user.id, 7),
  ]);

  const canSeeBalance = user.role === "admin";
  const balance = canSeeBalance ? await getBalance() : null;

  return Response.json({
    models,
    fromUpstream,
    defaultModel: process.env.LLM_MODEL || "deepseek-flash",
    quota: {
      ...quota,
      limits: LIMITS,
    },
    totals,
    balance,
  });
}
