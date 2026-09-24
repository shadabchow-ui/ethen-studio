/**
 * Public beta usage limits and guard helpers.
 *
 * These caps protect the platform during public beta before billing is
 * implemented. Follows the existing rate-limit / credit-debit patterns.
 */

export const BETA_DAILY_MESSAGE_CAP = 50;
export const BETA_DAILY_RESEARCH_RUN_CAP = 10;
export const BETA_DAILY_CODING_RUN_CAP = 5;
export const BETA_DAILY_FOUNDER_RUN_CAP = 5;
export const BETA_HOURLY_VOICE_TRANSCRIBE_CAP = 20;
export const BETA_HOURLY_VOICE_SPEECH_CAP = 30;
export const BETA_HOURLY_VOICE_REALTIME_CAP = 10;
export const BETA_MONTHLY_MEDIA_GENERATION_DEFAULT = 0; // gated — must be configured

export interface UsageLimit {
  /** Unique identifier for this limit. */
  id: string;
  /** Human-readable name. */
  label: string;
  /** Agent slug(s) this limit applies to. */
  agentIds: string[];
  /** Maximum count within the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Category for grouping in the dashboard. */
  category: "message" | "agent-run" | "media" | "voice" | "other";
  /** Whether this limit requires manual setup/approval to exceed. */
  requiresSetupToExceed: boolean;
  /** Whether the limit is enforced server-side. */
  enforced: boolean;
}

export const BETA_USAGE_LIMITS: readonly UsageLimit[] = [
  {
    id: "beta-daily-messages",
    label: "Messages per day",
    agentIds: ["chat", "writing", "code", "research", "studio", "finance", "job", "founder", "designer", "compute"],
    max: BETA_DAILY_MESSAGE_CAP,
    windowMs: 24 * 60 * 60 * 1000,
    category: "message",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-daily-research-runs",
    label: "Research runs per day",
    agentIds: ["research"],
    max: BETA_DAILY_RESEARCH_RUN_CAP,
    windowMs: 24 * 60 * 60 * 1000,
    category: "agent-run",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-daily-coding-runs",
    label: "Coding runs per day",
    agentIds: ["code", "coding"],
    max: BETA_DAILY_CODING_RUN_CAP,
    windowMs: 24 * 60 * 60 * 1000,
    category: "agent-run",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-daily-founder-runs",
    label: "Founder runs per day",
    agentIds: ["founder"],
    max: BETA_DAILY_FOUNDER_RUN_CAP,
    windowMs: 24 * 60 * 60 * 1000,
    category: "agent-run",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-hourly-voice-transcribe",
    label: "Voice transcriptions per hour",
    agentIds: ["voice"],
    max: BETA_HOURLY_VOICE_TRANSCRIBE_CAP,
    windowMs: 60 * 60 * 1000,
    category: "voice",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-hourly-voice-speech",
    label: "Voice speech generations per hour",
    agentIds: ["voice"],
    max: BETA_HOURLY_VOICE_SPEECH_CAP,
    windowMs: 60 * 60 * 1000,
    category: "voice",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-hourly-voice-realtime",
    label: "Voice realtime sessions per hour",
    agentIds: ["voice"],
    max: BETA_HOURLY_VOICE_REALTIME_CAP,
    windowMs: 60 * 60 * 1000,
    category: "voice",
    requiresSetupToExceed: false,
    enforced: true,
  },
  {
    id: "beta-monthly-media-generation",
    label: "Media generation",
    agentIds: ["studio", "media"],
    max: BETA_MONTHLY_MEDIA_GENERATION_DEFAULT,
    windowMs: 30 * 24 * 60 * 60 * 1000,
    category: "media",
    requiresSetupToExceed: true,
    enforced: false,
  },
] as const;

export function getUsageLimit(id: string): UsageLimit | undefined {
  return BETA_USAGE_LIMITS.find((l) => l.id === id);
}

export function getLimitsByAgent(agentId: string): UsageLimit[] {
  return BETA_USAGE_LIMITS.filter((l) => l.agentIds.includes(agentId));
}

export function getLimitsByCategory(category: UsageLimit["category"]): UsageLimit[] {
  return BETA_USAGE_LIMITS.filter((l) => l.category === category);
}

export const AGENT_USAGE_LABELS: Record<string, string> = {
  writing:   "Writing",
  code:      "Code",
  research:  "Research",
  studio:    "Studio",
  finance:   "Finance",
  job:       "Job",
  compute:   "Compute",
  founder:   "Founder",
  designer:  "Designer",
  chat:      "Chat",
};

export function getAgentUsageLabel(agentId: string): string {
  return AGENT_USAGE_LABELS[agentId] ?? agentId;
}

/**
 * Maximum counts per agent for display in the dashboard.
 * Derived from BETA_USAGE_LIMITS.
 */
export function getAgentMaxUsage(agentId: string): number {
  const limits = getLimitsByAgent(agentId);
  if (limits.length === 0) return BETA_DAILY_MESSAGE_CAP;
  return Math.max(...limits.map((l) => l.max));
}

/**
 * Whether media/video generation is gated (setup-required or manually approved).
 */
export function isMediaGenerationGated(): boolean {
  const limit = getUsageLimit("beta-monthly-media-generation");
  return limit?.requiresSetupToExceed ?? true;
}
