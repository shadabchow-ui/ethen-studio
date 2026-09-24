/** Studio V5 data — explicit typed API/UI states (STUDIO_02; empty/forbidden/setup/error). */
import "server-only";
import { studioError } from "../../contracts/errors";
import type { LoadState } from "../../contracts/states";
import { errorState, loadingState, readyState } from "../../contracts/states";
import type { Page, SearchEnvelope } from "./types";

export function listState<T>(page: Page<T> | SearchEnvelope<T>): LoadState<Page<T> | SearchEnvelope<T>> {
  if (page.items.length === 0) {
    return { kind: "empty", data: page, error: null, actionLabel: null };
  }
  return readyState(page);
}

export function detailState<T>(value: T | null, requestId: string, label: string): LoadState<T> {
  if (value === null) {
    return { kind: "empty", data: null, error: null, actionLabel: null };
  }
  void requestId;
  void label;
  return readyState(value);
}

export function forbiddenState<T>(requestId: string, message = "Not a member of this project."): LoadState<T> {
  return {
    kind: "forbidden",
    data: null,
    error: studioError("FORBIDDEN", message, requestId),
    actionLabel: "Request access",
  };
}

export function setupState<T>(requestId: string, message = "Studio data is not configured."): LoadState<T> {
  return {
    kind: "setup_required",
    data: null,
    error: studioError("INTERNAL", message, requestId),
    actionLabel: "Check configuration",
  };
}

export function failureState<T>(requestId: string, message: string): LoadState<T> {
  return errorState(studioError("INTERNAL", message, requestId));
}

export { loadingState };
