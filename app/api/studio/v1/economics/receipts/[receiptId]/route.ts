import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { EconomicsError, receiptLoadState } from "@ethen/studio-core/server/economics";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { getReceipt, listChildReservations } from "../../../_lib/supabase-economics";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_04 — V1 receipt adapter. Returns the terminal receipt with actual
 * vs estimated charge, released hold, absorbed provider cost and any
 * reconciling children. Reconciling receipts report `partial`, never a
 * fabricated total.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const params = await context.params;
    const receiptId = asString(params.receiptId);
    if (!receiptId) return studioError("VALIDATION_ERROR", "receiptId is required.");
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId query param is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const receipt = await getReceipt(resolved.scope, receiptId);
    if (!receipt) return studioError("NOT_FOUND", "Receipt not found in this scope.");
    const children = await listChildReservations(resolved.scope, receipt.reservationId);
    const state = receiptLoadState(receipt, children);
    return studioSuccess({
      state: state.kind,
      receipt: {
        receiptId: receipt.receiptId,
        reservationId: receipt.reservationId,
        jobId: receipt.jobId,
        estimatedIcu: receipt.estimatedIcu,
        chargedIcu: receipt.chargedIcu,
        releasedIcu: receipt.releasedIcu,
        absorbedProviderIcu: receipt.absorbedProviderIcu,
        reconcilingChildren: [...receipt.reconcilingChildren],
        settledAt: receipt.settledAt,
      },
      display: state.data,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Receipts need the Studio data service.");
    if (setup) return setup;
    if (error instanceof EconomicsError) {
      return studioError("INTERNAL_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Receipt read failed.");
  }
}
