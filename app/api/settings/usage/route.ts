import "server-only";

import { NextResponse } from "next/server";
import { requireUserSession } from "@ethen/ai/platform/auth/guards";

/**
 * Studio V3 Job 1 — scoped usage adapter (mirrors Chat's contract).
 *
 * GET /api/settings/usage — real metering state for Billing & Usage.
 * Same shared backend as Chat; only products with real usage are returned.
 */
export async function GET() {
  const authorization = await requireUserSession();
  if (authorization.response) return authorization.response;
  const actorId = authorization.actorId as string;

  try {
    const { getCreditBalance, getCreditLedger, getUsageEvents } = await import("@ethen/usage/server");
    const [balance, ledger, events] = await Promise.all([
      getCreditBalance(actorId).catch(() => 0),
      getCreditLedger(actorId, 25).catch(() => []),
      getUsageEvents(actorId, 100).catch(() => []),
    ]);

    const byProduct: Record<string, number> = {};
    for (const event of events as { event_type?: string }[]) {
      const key = typeof event.event_type === "string" && event.event_type ? event.event_type : "other";
      byProduct[key] = (byProduct[key] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      available: true,
      usage: {
        creditBalance: balance,
        creditLedger: ledger,
        recentEvents: (events as unknown[]).slice(0, 25),
        byProduct,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: true, available: false, reason: "Usage information is unavailable right now." },
      { status: 200 },
    );
  }
}
