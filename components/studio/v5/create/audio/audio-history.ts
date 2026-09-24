/**
 * STUDIO_M3A — audio history entries (pure, browser-safe).
 *
 * Projects a staged audio run's terminal-stage job onto the consistent
 * history-model entry the create lane stores, so the audio tables show
 * the same shape: admitted jobId, endpoint, quote, prompt text, cost,
 * retryability, and timestamps. Drafts (no admitted job) never record.
 */

import { formatIcuDollars, type PolledJobView, type QuoteView } from "../create-api-client";
import type { CreateHistoryEntry } from "../history-model";
import type { AudioToolId } from "./types";

/** Terminal stage per audio tool: the job whose outcome is history. */
export const AUDIO_HISTORY_FINAL_STAGE: Readonly<Record<AudioToolId, string>> = {
  voice: "synthesize",
  transcribe: "transcribe",
  dub: "mix",
  changer: "mix",
};

export function toAudioHistoryEntry(args: {
  toolId: AudioToolId;
  projectId: string;
  audioProjectId: string;
  job: PolledJobView;
  quote: QuoteView | null;
  promptText: string;
}): CreateHistoryEntry {
  return {
    projectId: args.projectId,
    idempotencyKey: args.audioProjectId,
    paramsHash: "",
    jobId: args.job.jobId,
    toolId: args.toolId,
    status: args.job.status,
    statusLabel: args.job.statusLabel,
    endpointId: args.job.endpointId || null,
    quoteId: args.job.quoteId || args.quote?.quoteId || null,
    promptText: args.promptText || "(no input)",
    previewUrl: null,
    costLabel: args.quote ? `Est. ${formatIcuDollars(args.quote.estimatedIcu)}` : null,
    retryable: args.job.retryable || args.job.status === "FAILED",
    createdAt: args.job.createdAt,
    updatedAt: args.job.updatedAt,
  };
}
