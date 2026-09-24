import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { DEFAULT_VERSION_PINS, TASK_NAMES, asIcu, type TaskName } from "@ethen/studio-core/contracts";
import {
  ECONOMICS_ERROR_STATUS,
  EconomicsError,
  createVersionedQuote,
  quoteLoadState,
  type MeterUnit,
} from "@ethen/studio-core/server/economics";
import { getFixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { SupabasePriceCatalog, SupabaseQuoteRepository } from "../../_lib/supabase-economics";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function economicsStatus(error: EconomicsError): { code: Parameters<typeof studioError>[0]; status: number } {
  const status = ECONOMICS_ERROR_STATUS[error.code] ?? 500;
  if (error.code === "ADMISSION_CLOSED") return { code: "PROVIDER_UNAVAILABLE", status };
  if (error.code === "APPROVAL_REQUIRED" || error.code === "QUOTE_EXPIRED") return { code: "APPROVAL_REQUIRED", status };
  if (error.code === "INSUFFICIENT_BALANCE") return { code: "INSUFFICIENT_CREDITS", status };
  if (error.code === "QUOTE_CONFLICT" || error.code === "RESERVATION_CONFLICT") return { code: "CONFLICT", status };
  if (error.code === "QUOTA_EXCEEDED" || error.code === "QUOTA_CONCURRENCY") return { code: "RATE_LIMITED", status };
  if (error.code === "NOT_FOUND") return { code: "NOT_FOUND", status };
  if (error.code === "INVALID_INPUT") return { code: "VALIDATION_ERROR", status };
  return { code: "INTERNAL_ERROR", status };
}

/**
 * STUDIO_04 — V1 estimate adapter. Authenticates, resolves the versioned
 * price row, and records an immutable quote. Missing/retired price config
 * closes paid admission (ADMISSION_CLOSED → 503), never a guessed price.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const task = asString(body.task);
    if (!task || !(TASK_NAMES as readonly string[]).includes(task)) {
      return studioError("VALIDATION_ERROR", "task is unknown.");
    }
    const endpointId = asString(body.endpointId);
    if (!endpointId) return studioError("VALIDATION_ERROR", "endpointId is required.");
    const meterQuantity = asInt(body.meterQuantity);
    if (meterQuantity === null) {
      return studioError("VALIDATION_ERROR", "meterQuantity must be a non-negative integer.");
    }
    const priceVersion = asString(body.priceVersion) ?? DEFAULT_VERSION_PINS.priceVersion;
    const capRaw = body.capIcu === undefined || body.capIcu === null ? null : asInt(body.capIcu);
    if (body.capIcu !== undefined && body.capIcu !== null && capRaw === null) {
      return studioError("VALIDATION_ERROR", "capIcu must be a non-negative integer.");
    }

    if ((await isStudioLocalRequest()) && process.env.STUDIO_LOCAL_RUNTIME === "fixture") {
      const lane = getFixtureLane();
      const quote = await lane.estimate({
        scope: resolved.scope,
        task: task as TaskName,
        endpointId,
        priceVersion,
        meterQuantity,
        capIcu: capRaw === null ? undefined : capRaw,
        hardCap: body.hardCap !== false,
        pins: { ...DEFAULT_VERSION_PINS, priceVersion },
      });
      const fixtureState = quoteLoadState(quote);
      return studioSuccess({
        state: fixtureState.kind,
        quote: {
          quoteId: quote.quoteId,
          task: quote.task,
          endpointId: quote.endpointId,
          estimatedCostIcu: quote.estimatedCostIcu,
          capIcu: quote.capIcu,
          hardCap: quote.hardCap,
          meterUnit: quote.meterUnit satisfies MeterUnit,
          meterQuantity: quote.meterQuantity,
          priceVersion: quote.priceVersion,
          expiresAt: quote.expiresAt,
        },
      });
    }

    const quote = await createVersionedQuote(
      new SupabasePriceCatalog(),
      new SupabaseQuoteRepository(),
      {
        task: task as TaskName,
        scope: resolved.scope,
        pins: { ...DEFAULT_VERSION_PINS, priceVersion },
        endpointId,
        priceVersion,
        meterQuantity,
        capIcu: capRaw === null ? undefined : asIcu(capRaw),
        hardCap: body.hardCap !== false,
      },
    );
    const state = quoteLoadState(quote);
    return studioSuccess({
      state: state.kind,
      quote: {
        quoteId: quote.quoteId,
        task: quote.task,
        endpointId: quote.endpointId,
        estimatedCostIcu: quote.estimatedCostIcu,
        capIcu: quote.capIcu,
        hardCap: quote.hardCap,
        meterUnit: quote.meterUnit satisfies MeterUnit,
        meterQuantity: quote.meterQuantity,
        priceVersion: quote.priceVersion,
        expiresAt: quote.expiresAt,
      },
      display: state.data,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Quotes need the Studio data service.");
    if (setup) return setup;
    if (error instanceof EconomicsError) {
      const mapped = economicsStatus(error);
      return studioError(mapped.code, error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Estimate failed.");
  }
}
