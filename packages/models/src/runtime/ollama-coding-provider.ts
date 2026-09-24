import "server-only";

import { getDefaultOllamaAdapter } from "../local/ollama-adapter";
import {
  probeLocalRuntimeCapabilities,
  streamLocalRuntimeText,
  type LocalRuntimeCapabilityProbe,
} from "../local/consumer-contract";
import type { OllamaLocalModelAdapter } from "@ethen/contracts/local-models/local-model-types";
import type { CodingProvider, CodingProviderFinalReport, CodingProviderPatch, CodingProviderPlan } from "./coding-provider";
import type { ProbeUsage } from "./types";

export type OllamaCodingCapabilityProbe = LocalRuntimeCapabilityProbe;

function parseJsonBlock<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse(fenced ?? raw) as T;
}

async function streamText(adapter: OllamaLocalModelAdapter, model: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
  return (await streamLocalRuntimeText(adapter, model, messages)).text;
}

/** Uses the existing localhost-only adapter; no direct or remote transport is introduced. */
export async function probeOllamaCodingCapabilities(model: string, adapter: OllamaLocalModelAdapter = getDefaultOllamaAdapter()): Promise<OllamaCodingCapabilityProbe> {
  return probeLocalRuntimeCapabilities(model, adapter);
}

export function createOllamaCodingProvider(input: { model: string; adapter?: OllamaLocalModelAdapter }): CodingProvider {
  const adapter = input.adapter ?? getDefaultOllamaAdapter();
  let lastUsage: ProbeUsage | null = null;
  async function requestJson<T>(system: string, prompt: string): Promise<T> {
    const text = await streamText(adapter, input.model, [{ role: "system", content: system }, { role: "user", content: prompt }]);
    lastUsage = null;
    return parseJsonBlock<T>(text);
  }
  return {
    id: "ollama-local", label: "Ollama (local)",
    capabilities: { toolCalling: false, toolResultContinuation: false, codingMode: false, warnings: ["Local Code execution supports streamed planning only; tool-dependent builds are blocked."] },
    get lastProviderUsage(): ProbeUsage | null { return lastUsage; },
    createPlan: ({ prompt, context }) => requestJson<CodingProviderPlan>("You are a local coding planner. Return strict JSON only.", `Return JSON with keys: goal, findings, proposedChanges, nonScope, validation, risks.\n\nTask:\n${prompt}\n\nContext:\n${context}`),
    createPatch: ({ prompt, context, plan }) => requestJson<CodingProviderPatch>("You are a local coding agent. Return strict JSON only.", `Return JSON with keys: title, reason, patch, expectedFiles, validationCommands.\n\nTask:\n${prompt}\n\nPlan:\n${JSON.stringify(plan)}\n\nContext:\n${context}`),
    createFinalReport: ({ prompt, plan, changedFiles, validationSummary }): Promise<CodingProviderFinalReport> => {
      lastUsage = null;
      return Promise.resolve({ summary: `${prompt} — ${plan.goal}`, knownRisks: ["Local runtime usage is not reported by this adapter."], nextActions: changedFiles.length === 0 ? ["No file changes were applied."] : [validationSummary] });
    },
  };
}
