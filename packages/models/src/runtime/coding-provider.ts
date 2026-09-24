import "server-only";

import type { ProbeUsage, ProviderConnectionConfig } from "./types";
import { openAICompatibleChat } from "./openai-compatible-adapter";
import { anthropicChat } from "./anthropic-adapter";

export interface CodingProviderCapabilities {
  toolCalling: boolean;
  toolResultContinuation: boolean;
  codingMode: boolean;
  warnings?: string[];
}

export interface CodingProviderPlan {
  goal: string;
  findings: string[];
  proposedChanges: string[];
  nonScope: string[];
  validation: string[];
  risks: string[];
}

export interface CodingProviderPatch {
  title: string;
  reason: string;
  patch: string;
  expectedFiles: string[];
  validationCommands?: string[];
}

export interface CodingProviderFinalReport {
  summary: string;
  knownRisks: string[];
  nextActions: string[];
}

/**
 * Authoritative execution envelope for coding providers.  Provider adapters
 * may keep their provider-specific wire format, but every coding operation
 * enters the runtime through this shape so cancellation, usage and provenance
 * have one meaning.
 */
export type CodingProviderOperation = "plan" | "patch" | "repair" | "final_report";

export interface CodingProviderExecutionRequest {
  operation: CodingProviderOperation;
  input:
    | { prompt: string; context: string }
    | { prompt: string; context: string; plan: CodingProviderPlan }
    | { prompt: string; context: string; plan: CodingProviderPlan; failedCommands: string[]; validationSummary: string }
    | { prompt: string; context: string; plan: CodingProviderPlan; changedFiles: string[]; validationSummary: string };
  signal?: AbortSignal;
}

export interface CodingProviderExecutionResult<T> {
  value: T;
  usage: ProbeUsage | null;
  providerId: string;
  providerLabel: string;
  warnings: string[];
}

export interface CodingProvider {
  id: string;
  label: string;
  capabilities: CodingProviderCapabilities;
  createPlan(input: { prompt: string; context: string }): Promise<CodingProviderPlan>;
  createPatch(input: { prompt: string; context: string; plan: CodingProviderPlan }): Promise<CodingProviderPatch>;
  createRepairPatch?(input: {
    prompt: string;
    context: string;
    plan: CodingProviderPlan;
    failedCommands: string[];
    validationSummary: string;
  }): Promise<CodingProviderPatch | null>;
  createFinalReport?(input: {
    prompt: string;
    context: string;
    plan: CodingProviderPlan;
    changedFiles: string[];
    validationSummary: string;
  }): Promise<CodingProviderFinalReport | null>;
  /** Provider usage from the most recent model call. Null when the adapter
   *  did not include usage data, or when no model call has been made yet. */
  lastProviderUsage: ProbeUsage | null;
  /** Shared execution seam for connected and fixture providers. */
  execute?<T>(request: CodingProviderExecutionRequest): Promise<CodingProviderExecutionResult<T>>;
}

const activeExecutionControllers = new Map<string, AbortController>();

/** Starts a cancellable provider call for a run. Replacing an old controller
 * makes repeated interrupts idempotent and prevents stale calls from being
 * treated as active. */
export function beginCodingProviderExecution(runId: string): AbortSignal {
  activeExecutionControllers.get(runId)?.abort();
  const controller = new AbortController();
  activeExecutionControllers.set(runId, controller);
  return controller.signal;
}

export function endCodingProviderExecution(runId: string): void {
  activeExecutionControllers.delete(runId);
}

export function abortCodingProviderExecution(runId: string): boolean {
  const controller = activeExecutionControllers.get(runId);
  if (!controller || controller.signal.aborted) return false;
  controller.abort();
  return true;
}

async function callTextModel(
  config: ProviderConnectionConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<{ text: string; usage: ProbeUsage | null }> {
  if (config.protocol === "anthropic") {
    const result = await anthropicChat(
      config,
      [{ role: "user", content: user }],
      { system, maxTokens: 2000, signal },
    );
    return { text: result.responseText ?? "", usage: result.usage ?? null };
  }

  const result = await openAICompatibleChat(config, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], { signal });
  return { text: result.responseText ?? "", usage: result.usage ?? null };
}

function parseJsonBlock<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? raw;
  return JSON.parse(candidate) as T;
}

export function createConnectedCodingProvider(input: {
  label: string;
  config: ProviderConnectionConfig;
  capabilities: CodingProviderCapabilities;
}): CodingProvider {
  const { label, config, capabilities } = input;
  let lastUsage: ProbeUsage | null = null;

  return {
    id: config.providerId,
    label,
    capabilities,
    get lastProviderUsage(): ProbeUsage | null { return lastUsage; },
    async execute<T>(request: CodingProviderExecutionRequest): Promise<CodingProviderExecutionResult<T>> {
      const input = request.input;
      let value: unknown;
      let usage: ProbeUsage | null = null;
      if (request.operation === "plan") {
        const { text, usage: reportedUsage } = await callTextModel(config, "You are a local coding agent planner. Return strict JSON only.", ["Create a concise implementation plan for this coding task.", "Return JSON with keys: goal, findings, proposedChanges, nonScope, validation, risks.", "", `Task:\n${input.prompt}`, "", `Context:\n${input.context}`].join("\n"), request.signal);
        value = parseJsonBlock<CodingProviderPlan>(text); usage = reportedUsage;
      } else if (request.operation === "patch" || request.operation === "repair") {
        const patchInput = input as Extract<CodingProviderExecutionRequest["input"], { plan: CodingProviderPlan }>;
        const repair = request.operation === "repair";
        const { text, usage: reportedUsage } = await callTextModel(config, repair ? "You are a local coding agent repair loop. Return strict JSON only." : "You are a local coding agent. Return strict JSON only.", [repair ? "Create one repair patch proposal." : "Create a single patch proposal for this task.", "Return JSON with keys: title, reason, patch, expectedFiles, validationCommands.", "The patch must use the Begin/End patch format already expected by the repository.", "", `Task:\n${patchInput.prompt}`, "", `Plan:\n${JSON.stringify(patchInput.plan, null, 2)}`, "", `Context:\n${patchInput.context}`].join("\n"), request.signal);
        value = repair && text.trim() === "null" ? null : parseJsonBlock<CodingProviderPatch>(text); usage = reportedUsage;
      } else {
        const reportInput = input as Extract<CodingProviderExecutionRequest["input"], { changedFiles: string[] }>;
        value = { summary: `${reportInput.prompt} — ${reportInput.plan.goal}`, knownRisks: [], nextActions: reportInput.changedFiles.length === 0 ? ["No file changes were applied."] : [`Review ${reportInput.changedFiles.length} changed file(s).`, reportInput.validationSummary] } satisfies CodingProviderFinalReport;
      }
      lastUsage = usage;
      return { value: value as T, usage, providerId: config.providerId, providerLabel: label, warnings: capabilities.warnings ?? [] };
    },
    async createPlan({ prompt, context }) {
      const { text, usage } = await callTextModel(
        config,
        "You are a local coding agent planner. Return strict JSON only.",
        [
          "Create a concise implementation plan for this coding task.",
          "Return JSON with keys: goal, findings, proposedChanges, nonScope, validation, risks.",
          "",
          `Task:\n${prompt}`,
          "",
          `Context:\n${context}`,
        ].join("\n"),
      );
      lastUsage = usage;
      return parseJsonBlock<CodingProviderPlan>(text);
    },
    async createPatch({ prompt, context, plan }) {
      const { text, usage } = await callTextModel(
        config,
        "You are a local coding agent. Return strict JSON only.",
        [
          "Create a single patch proposal for this task.",
          "Return JSON with keys: title, reason, patch, expectedFiles, validationCommands.",
          "The patch must use the Begin/End patch format already expected by the repository.",
          "Only include repo-relative paths in expectedFiles.",
          "",
          `Task:\n${prompt}`,
          "",
          `Plan:\n${JSON.stringify(plan, null, 2)}`,
          "",
          `Context:\n${context}`,
        ].join("\n"),
      );
      lastUsage = usage;
      return parseJsonBlock<CodingProviderPatch>(text);
    },
    async createRepairPatch({ prompt, context, plan, failedCommands, validationSummary }) {
      const { text, usage } = await callTextModel(
        config,
        "You are a local coding agent repair loop. Return strict JSON only.",
        [
          "Create one repair patch proposal.",
          "Return JSON with keys: title, reason, patch, expectedFiles, validationCommands.",
          "If no safe repair is possible, return JSON null.",
          "",
          `Task:\n${prompt}`,
          "",
          `Plan:\n${JSON.stringify(plan, null, 2)}`,
          "",
          `Failed commands: ${failedCommands.join(", ")}`,
          `Validation summary: ${validationSummary}`,
          "",
          `Context:\n${context}`,
        ].join("\n"),
      );
      lastUsage = usage;
      if (text.trim() === "null") return null;
      return parseJsonBlock<CodingProviderPatch>(text);
    },
    async createFinalReport({ prompt, plan, changedFiles, validationSummary }) {
      lastUsage = null;
      return {
        summary: `${prompt} — ${plan.goal}`,
        knownRisks: [],
        nextActions: changedFiles.length === 0 ? ["No file changes were applied."] : [`Review ${changedFiles.length} changed file(s).`, validationSummary],
      };
    },
  };
}
