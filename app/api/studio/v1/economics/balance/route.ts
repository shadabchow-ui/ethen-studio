import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { isStudioSetupError } from "@/lib/media/studio-setup";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { EconomicsError } from "@ethen/studio-core/server/economics";
import { getBalance } from "../../_lib/supabase-economics";

export const dynamic = "force-dynamic";

export type BalanceReadState = "ready" | "setup_required" | "error";

export interface BalanceReadBody {
  state: BalanceReadState;
  balanceIcu?: number;
  reservedIcu?: number;
  message?: string;
}

/**
 * M6A D3 — V1 credit balance read. Always answers 200 with a state
 * discriminant: `ready` carries the measured row, `setup_required`
 * marks the loopback lane or a missing balance row, and `error`
 * carries a message. Failures never fabricate a 0 balance (unlike the
 * legacy settings usage read, which this does not use).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    if (await isStudioLocalRequest()) {
      return studioSuccess<BalanceReadBody>({ state: "setup_required", message: "Credit balances need a hosted project." });
    }
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) {
      return studioSuccess<BalanceReadBody>({ state: "setup_required", message: "Project has no Studio data scope yet." });
    }
    const balance = await getBalance(resolved.scope);
    if (!balance) {
      return studioSuccess<BalanceReadBody>({ state: "setup_required", message: "No credit balance row for this project yet." });
    }
    return studioSuccess<BalanceReadBody>({
      state: "ready",
      balanceIcu: Number(balance.balanceIcu),
      reservedIcu: Number(balance.heldIcu),
    });
  } catch (error) {
    if (error instanceof EconomicsError) {
      return studioSuccess<BalanceReadBody>({ state: "error", message: error.message });
    }
    if (isStudioSetupError(error)) {
      return studioSuccess<BalanceReadBody>({ state: "setup_required", message: "Credit balance needs the Studio data service." });
    }
    return studioSuccess<BalanceReadBody>({ state: "error", message: error instanceof Error ? error.message : "Balance read failed." });
  }
}
