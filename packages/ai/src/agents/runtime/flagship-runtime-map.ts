/**
 * ETHEN-READY-036: Canonical flagship-to-runtime map.
 *
 * Binds each approved flagship product to its executable-agent contract.
 * Every public agent in the portfolio must have a certified runtime entry here.
 * Non-flagship/internal records are labelled accordingly and excluded from
 * the runtime certification requirement.
 */
import { deriveImplementationStatus } from "./agent-contract";

// ── Labels for non-executable records ──────────────────────────────────────

export type RuntimeLabel =
  | "FLAGSHIP_RUNTIME"
  | "INFRASTRUCTURE"
  | "PLATFORM"
  | "INTERNAL_HELPER"
  | "COMPATIBILITY_ALIAS"
  | "TEMPLATE_ONLY"
  | "NOT_EXECUTABLE";

export interface FlagshipRuntimeEntry {
  portfolioId: string;
  slug: string;
  name: string;
  label: RuntimeLabel;
  executableEvidence?: {
    hasFunctionalSpec: boolean;
    hasWorkbenchConfig: boolean;
    hasRuntimeRunner: boolean;
    hasDurableQueueHandler: boolean;
    hasPassingAcceptanceTests: boolean;
    implementationRef?: string;
    notes?: string;
  };
  notes: string;
}

function evidence(overrides: Partial<FlagshipRuntimeEntry["executableEvidence"] & Record<string, boolean | string | undefined>>): FlagshipRuntimeEntry["executableEvidence"] {
  return {
    hasFunctionalSpec: false,
    hasWorkbenchConfig: false,
    hasRuntimeRunner: false,
    hasDurableQueueHandler: false,
    hasPassingAcceptanceTests: false,
    ...overrides,
  } as FlagshipRuntimeEntry["executableEvidence"];
}

export const FLAGSHIP_RUNTIME_MAP: FlagshipRuntimeEntry[] = [
  // ════════════════════════════════════════════════════
  // FLAGSHIP RUNTIMES
  // ════════════════════════════════════════════════════
  {
    portfolioId: "ethen-auto",
    slug: "universal-composer-agent",
    name: "Ethen Auto / Cortex",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/agents/runtime/service.ts",
      notes: "Cortex service.ts runs the universal composer loop with tool execution, evidence, and approval gating.",
    }),
    notes: "Full conversational agent runtime with tool execution, approval gates, evidence emission, and run envelope.",
  },
  {
    portfolioId: "research",
    slug: "research-agent",
    name: "Research",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/agents/runtime/service.ts + app/research/",
      notes: "Research workspace restored with plan/verify/export per READY-020.",
    }),
    notes: "Research workspace with plan, verify, and export endpoints. Full executable-agent runtime through service.ts.",
  },
  {
    portfolioId: "code",
    slug: "coding-agent",
    name: "Code + Desktop",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasWorkbenchConfig: true,
      hasRuntimeRunner: true,
      hasDurableQueueHandler: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/coding/runtime/agent-controller.ts + store.ts + durable-execution.ts",
      notes: "Full agent controller with plan/patch/validate/repair loop, approval system, terminal, sandbox, and SP-01 durable execution bridge.",
    }),
    notes: "Largest production runtime: agent controller, store, approvals, patches, validation, sandbox, durable execution.",
  },
  {
    portfolioId: "computer-use",
    slug: "computer-use-agent",
    name: "Computer Use",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/agents/runtime/computer-use/",
      notes: "Computer Use has storage, session lifecycle, and approval-gated execution via service.ts.",
    }),
    notes: "Computer Use runtime with storage, session management, and approval-gated execution.",
  },
  {
    portfolioId: "security",
    slug: "sentinel-agent",
    name: "Sentinel",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/sentinel/",
      notes: "Sentinel has scanner registry, AI investigator, remediation loop, and 2000+ tests.",
    }),
    notes: "Full security agent with scanners, AI investigator, remediation loop, container isolation.",
  },
  {
    portfolioId: "studio",
    slug: "media-agent",
    name: "Studio",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/media/",
      notes: "Studio has apps, providers, safety, budgets, canvas graph, identity profiles. Lifecycle: unavailable (frozen).",
    }),
    notes: "Media generation runtime with apps, providers, safety gates, budget enforcement, and canvas graph.",
  },
  {
    portfolioId: "voice",
    slug: "voice-agent",
    name: "Voice",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "app/api/voice/voices/route.ts + lib/voice/",
      notes: "Voice has voices API, creation, and telephony routes per READY-029/030.",
    }),
    notes: "Voice synthesis and telephony runtime with voices API and creation routes.",
  },
  {
    portfolioId: "automation",
    slug: "flow-agent",
    name: "Automation / Workflow",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "lib/flows/",
      notes: "Workflow has runs, approvals, webhook triggers, and route activation.",
    }),
    notes: "Workflow automation runtime with triggers, actions, approvals, and webhook support.",
  },
  {
    portfolioId: "designer",
    slug: "designer-agent",
    name: "Designer",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasRuntimeRunner: true,
      implementationRef: "Generic agent runtime via service.ts",
      notes: "Designer runs through the generic agent runtime with provider-backed generation deferred pending certification.",
    }),
    notes: "Independent Product 10 — runs through the shared agent runtime; unavailable until certification.",
  },
  {
    portfolioId: "founder",
    slug: "founder-agent",
    name: "Founder",
    label: "FLAGSHIP_RUNTIME",
    executableEvidence: evidence({
      hasFunctionalSpec: true,
      hasRuntimeRunner: true,
      hasPassingAcceptanceTests: true,
      implementationRef: "app/founder-agent/ + 0010_founder_companies.sql + 0010_founder_profiles.sql",
      notes: "Founder has routes, profiles, companies tables, and runtime support.",
    }),
    notes: "Independent Product 11 — dedicated routes, database migrations, and runtime support; unavailable pending certification.",
  },

  // ════════════════════════════════════════════════════
  // INFRASTRUCTURE
  // ════════════════════════════════════════════════════
  {
    portfolioId: "local-runtimes",
    slug: "compute-agent",
    name: "Local Models (compute)",
    label: "INFRASTRUCTURE",
    notes: "Protected provider/runtime infrastructure. Not a conversational agent. Maintained as compute-agent for internal runtime use.",
  },
  {
    portfolioId: "local-runtimes",
    slug: "vm-agent",
    name: "Local Models (VM)",
    label: "INFRASTRUCTURE",
    notes: "VM runtime for local models. Infrastructure, not a conversational agent.",
  },

  // ════════════════════════════════════════════════════
  // PLATFORM (not agents)
  // ════════════════════════════════════════════════════
  {
    portfolioId: "gateway",
    slug: "gateway",
    name: "Gateway / BYOK",
    label: "PLATFORM",
    notes: "Protected platform (provider routing, BYOK, credentials). Not a conversational agent.",
  },
  {
    portfolioId: "model-intelligence",
    slug: "model-intelligence",
    name: "Model Intelligence",
    label: "PLATFORM",
    notes: "Protected data/benchmark/leaderboard platform. Not a conversational agent.",
  },

  // ════════════════════════════════════════════════════
  // COMPATIBILITY ALIASES
  // ════════════════════════════════════════════════════
  {
    portfolioId: "research",
    slug: "research-assistant",
    name: "Research Assistant",
    label: "COMPATIBILITY_ALIAS",
    notes: "Legacy slug that redirects to research-agent. Not a separate runtime.",
  },
  {
    portfolioId: "code",
    slug: "code-helper",
    name: "Code Helper",
    label: "COMPATIBILITY_ALIAS",
    notes: "Legacy slug that redirects to coding-agent. Not a separate runtime.",
  },
  {
    portfolioId: "automation",
    slug: "workflow-automation-agent",
    name: "Workflow Automation Agent",
    label: "COMPATIBILITY_ALIAS",
    notes: "Legacy slug for workflow. Part of Automation/Workflow flagship.",
  },

  // ════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ════════════════════════════════════════════════════
  {
    portfolioId: "model",
    slug: "chatbot-agent",
    name: "Chatbot Agent",
    label: "INTERNAL_HELPER",
    notes: "Internal helper for Model workspace chat. Not a standalone product.",
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────

const slugIndex = new Map<string, FlagshipRuntimeEntry>();
for (const entry of FLAGSHIP_RUNTIME_MAP) {
  slugIndex.set(entry.slug, entry);
}

export function getFlagshipRuntime(slug: string): FlagshipRuntimeEntry | undefined {
  return slugIndex.get(slug);
}

export function getFlagshipRuntimes(): FlagshipRuntimeEntry[] {
  return FLAGSHIP_RUNTIME_MAP.filter((e) => e.label === "FLAGSHIP_RUNTIME");
}

export function getRuntimesByLabel(label: RuntimeLabel): FlagshipRuntimeEntry[] {
  return FLAGSHIP_RUNTIME_MAP.filter((e) => e.label === label);
}

export function isRuntimeCertified(slug: string): boolean {
  const entry = slugIndex.get(slug);
  if (!entry) return false;
  if (entry.label !== "FLAGSHIP_RUNTIME") return false;
  if (!entry.executableEvidence) return false;
  const status = deriveImplementationStatus(entry.executableEvidence as Parameters<typeof deriveImplementationStatus>[0]);
  return status !== "not_started";
}

export function getRuntimeStatus(slug: string): string {
  const entry = slugIndex.get(slug);
  if (!entry) return "not_registered";
  if (entry.label !== "FLAGSHIP_RUNTIME") return entry.label.toLowerCase();
  if (!entry.executableEvidence) return "no_evidence";
  return deriveImplementationStatus(entry.executableEvidence as Parameters<typeof deriveImplementationStatus>[0]);
}
