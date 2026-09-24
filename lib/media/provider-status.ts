import "server-only";

import type { MediaProviderStatus } from "@ethen/contracts/media/types";
import { getAllProviderStatus, type MediaProviderId, PROVIDER_METAS } from "./providers/index";

export interface MediaProviderStatusResponse {
  providers: MediaProviderStatus[];
  /** Map of provider id to raw status. */
  byProvider: Record<string, MediaProviderStatus>;
  /** Counts by trust label. */
  counts: {
    live: number;
    mock: number;
    setup_required: number;
    not_provided: number;
    disabled: number;
    failed: number;
    fallback: number;
    unavailable: number;
  };
  /** Timestamp of the status snapshot. */
  generatedAt: string;
}

export function getMediaProviderStatus(): MediaProviderStatusResponse {
  const providers = getAllProviderStatus();

  const byProvider: Record<string, MediaProviderStatus> = {};
  const counts = { live: 0, mock: 0, setup_required: 0, not_provided: 0, disabled: 0, failed: 0, fallback: 0, unavailable: 0 };

  for (const p of providers) {
    byProvider[p.id] = p;
    if (p.trust === "live") counts.live += 1;
    else if (p.trust === "mock") counts.mock += 1;
    else if (p.trust === "setup_required") counts.setup_required += 1;
    else if (p.trust === "disabled") counts.disabled += 1;
    else if (p.trust === "failed") counts.failed += 1;
    else if (p.trust === "fallback") counts.fallback += 1;
    else if (p.trust === "unavailable") counts.unavailable += 1;
    else counts.not_provided += 1;
  }

  return {
    providers,
    byProvider,
    counts,
    generatedAt: new Date().toISOString(),
  };
}
