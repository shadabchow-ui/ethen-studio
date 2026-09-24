/**
 * Usage event type registry — canonical event categories for the Ethen platform.
 *
 * Every usage event inserted into usage_events must use one of the
 * event_type values exported here. This contract lets UI surfaces,
 * admin dashboards, quota checks, and validation scripts rely on a
 * stable set of event types without guessing string values.
 */

export type UsageEventCategory =
  | "model"
  | "tool"
  | "media"
  | "browser"
  | "coding"
  | "research"
  | "compute"
  | "storage"
  | "failed"
  | "refund";

export interface UsageEventTypeEntry {
  /** The exact event_type string stored in usage_events.event_type. */
  type: string;
  category: UsageEventCategory;
  /** Human-readable short label for tables/badges. */
  label: string;
  /** Whether credits are typically consumed by this event type. */
  consumptive: boolean;
}

export const USAGE_EVENT_TYPES: readonly UsageEventTypeEntry[] = [
  // ── Model tokens ─────────────────────────────────────────────────────
  { type: "model.chat",              category: "model",    label: "Chat completion",      consumptive: true },
  { type: "model.embedding",         category: "model",    label: "Embedding",            consumptive: true },
  { type: "model.image",             category: "model",    label: "Image generation",     consumptive: true },
  { type: "model.transcription",     category: "model",    label: "Transcription",        consumptive: true },
  { type: "model.rerank",            category: "model",    label: "Reranking",            consumptive: true },

  // ── Tool calls ───────────────────────────────────────────────────────
  { type: "tool.call",               category: "tool",     label: "Tool call",            consumptive: true },
  { type: "tool.call.mock",          category: "tool",     label: "Mock tool call",       consumptive: false },

  // ── Media jobs ───────────────────────────────────────────────────────
  { type: "media.generate",          category: "media",    label: "Media generation",     consumptive: true },
  { type: "media.generate.mock",     category: "media",    label: "Mock media generation",consumptive: false },
  { type: "media.generate.setup_required", category: "media", label: "Media — setup required", consumptive: false },
  { type: "media.generate.failed",   category: "media",    label: "Media — failed",       consumptive: false },
  { type: "media.export",            category: "media",    label: "Media export",         consumptive: false },
  { type: "media.storage.add",       category: "storage",  label: "Media storage added",  consumptive: false },
  { type: "media.storage.remove",    category: "storage",  label: "Media storage removed",consumptive: false },
  { type: "media.project.create",    category: "media",    label: "Media project created",consumptive: false },
  { type: "media.project.archive",   category: "media",    label: "Media project archived",consumptive: false },
  { type: "media.asset.favorite",    category: "media",    label: "Media asset favorited",consumptive: false },
  { type: "media.asset.assign",      category: "media",    label: "Media asset assigned", consumptive: false },

  // ── Browser minutes ─────────────────────────────────────────────────
  { type: "browser.session.start",   category: "browser",  label: "Browser session start", consumptive: true },
  { type: "browser.session.end",     category: "browser",  label: "Browser session end",   consumptive: true },
  { type: "browser.action",          category: "browser",  label: "Browser action",        consumptive: true },

  // ── Coding runtime minutes ───────────────────────────────────────────
  { type: "coding.run.start",        category: "coding",   label: "Coding run start",      consumptive: true },
  { type: "coding.run.complete",     category: "coding",   label: "Coding run complete",   consumptive: true },
  { type: "coding.step",             category: "coding",   label: "Coding step",           consumptive: true },
  { type: "coding.checkpoint",       category: "coding",   label: "Coding checkpoint",    consumptive: false },

  // ── Research source calls ────────────────────────────────────────────
  { type: "research.source.call",    category: "research", label: "Research source call",  consumptive: true },
  { type: "research.provider.health",category: "research", label: "Research provider health check", consumptive: false },

  // ── Compute actions ─────────────────────────────────────────────────
  { type: "compute.instance.launch", category: "compute",  label: "Compute instance launch",consumptive: true },
  { type: "compute.instance.stop",   category: "compute",  label: "Compute instance stop",  consumptive: false },
  { type: "compute.job.run",         category: "compute",  label: "Compute job run",        consumptive: true },
  { type: "compute.job.complete",    category: "compute",  label: "Compute job complete",   consumptive: true },

  // ── Storage / assets ────────────────────────────────────────────────
  { type: "storage.upload",          category: "storage",  label: "Storage upload",        consumptive: true },
  { type: "storage.delete",          category: "storage",  label: "Storage delete",        consumptive: false },
  { type: "storage.asset.create",    category: "storage",  label: "Asset created",         consumptive: false },

  // ── Failed jobs ──────────────────────────────────────────────────────
  { type: "failed.job.provider_error",category: "failed",  label: "Failed — provider error",consumptive: false },
  { type: "failed.job.timeout",      category: "failed",   label: "Failed — timeout",      consumptive: false },
  { type: "failed.job.invalid_output",category: "failed",  label: "Failed — invalid output",consumptive: false },
  { type: "failed.job.cancelled",    category: "failed",   label: "Failed — cancelled",    consumptive: false },

  // ── Refunds / no-charge events ───────────────────────────────────────
  { type: "refund.provider_failure", category: "refund",   label: "Refund — provider failure", consumptive: false },
  { type: "refund.no_charge",        category: "refund",   label: "No charge — setup/mock",    consumptive: false },
  { type: "refund.manual",           category: "refund",   label: "Manual refund",             consumptive: false },

  // ── Voice events ────────────────────────────────────────────────────
  { type: "voice.speech.generate",        category: "model",  label: "Voice speech generation",     consumptive: true },
  { type: "voice.speech.generate.mock",   category: "model",  label: "Voice speech — mock",         consumptive: false },
  { type: "voice.speech.generate.failed", category: "failed", label: "Voice speech — failed",       consumptive: false },
  { type: "voice.transcribe",             category: "model",  label: "Voice transcription",         consumptive: true },
  { type: "voice.transcribe.mock",        category: "model",  label: "Voice transcription — mock",  consumptive: false },
  { type: "voice.transcribe.failed",      category: "failed", label: "Voice transcription — failed",consumptive: false },
  { type: "voice.realtime.session",       category: "model",  label: "Voice realtime session",      consumptive: true },
  { type: "voice.realtime.session.mock",  category: "model",  label: "Voice realtime — mock",       consumptive: false },
  { type: "voice.realtime.session.failed",category: "failed", label: "Voice realtime — failed",     consumptive: false },

  // ── Designer events ─────────────────────────────────────────────────
  { type: "designer.generate",            category: "model",  label: "Designer generation",         consumptive: true },
  { type: "designer.refinement",          category: "model",  label: "Designer refinement",         consumptive: true },
  { type: "designer.generate.mock",       category: "model",  label: "Designer generation — mock",  consumptive: false },
  { type: "designer.generate.setup_required", category: "model", label: "Designer — setup required", consumptive: false },
  { type: "designer.generate.failed",     category: "failed", label: "Designer — failed",           consumptive: false },
] as const;

/** Lookup an event type entry by its type string. */
export function getUsageEventTypeEntry(type: string): UsageEventTypeEntry | undefined {
  return USAGE_EVENT_TYPES.find((e) => e.type === type);
}

/** Category labels for UI filters/tabs. */
export const USAGE_CATEGORY_LABELS: Record<UsageEventCategory, string> = {
  model:    "Model tokens",
  tool:     "Tool calls",
  media:    "Media jobs",
  browser:  "Browser minutes",
  coding:   "Coding runtime",
  research: "Research sources",
  compute:  "Compute actions",
  storage:  "Storage / assets",
  failed:   "Failed jobs",
  refund:   "Refunds / no-charge",
};

/** Convenience set of known valid event type strings. */
export const VALID_EVENT_TYPES = new Set(USAGE_EVENT_TYPES.map((e) => e.type));
