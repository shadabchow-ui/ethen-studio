/** Studio V5 composites — typed UI states for consumers (STUDIO_15, server-only). */
import "server-only";
import { studioError } from "../../contracts/errors";
import type { LoadState } from "../../contracts/states";
import type { CampaignRecord, CampaignReview, CampaignVariant, CompositionTemplate } from "./types";

export function templateListState(templates: CompositionTemplate[]): LoadState<CompositionTemplate[]> {
  return {
    kind: templates.length === 0 ? "empty" : "ready",
    data: templates,
    error: null,
    actionLabel: templates.length === 0 ? null : null,
  };
}

export function campaignListState(campaigns: CampaignRecord[]): LoadState<CampaignRecord[]> {
  return { kind: campaigns.length === 0 ? "empty" : "ready", data: campaigns, error: null, actionLabel: null };
}

export function variantListState(variants: CampaignVariant[]): LoadState<CampaignVariant[]> {
  return { kind: variants.length === 0 ? "empty" : "ready", data: variants, error: null, actionLabel: null };
}

export function reviewLoadState(review: CampaignReview | null): LoadState<CampaignReview | null> {
  return { kind: review ? "ready" : "empty", data: review, error: null, actionLabel: null };
}

export function compositesLoadingState<T>(): LoadState<T> {
  return { kind: "loading", data: null, error: null, actionLabel: null };
}

export function compositesErrorState<T>(requestId: string, message: string): LoadState<T> {
  return { kind: "error", data: null, error: studioError("INTERNAL", message, requestId, false), actionLabel: "Retry" };
}

export function compositesSetupState<T>(message: string): LoadState<T> {
  return {
    kind: "setup_required",
    data: null,
    error: studioError("BAD_REQUEST", message, "setup", false),
    actionLabel: "Set up",
  };
}
