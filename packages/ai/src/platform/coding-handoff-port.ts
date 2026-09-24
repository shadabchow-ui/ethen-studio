"use strict";

/**
 * Coding-handoff port.
 *
 * Founder production handoff and Designer handoff both create a Code draft
 * run when a handoff is approved, and Founder's repo scout reads CI status.
 * The Code runtime is Code-product implementation: a Founder or Creative
 * deployable must not import it, and it must not be pulled into a shared
 * package (it drags the whole Code runtime with it).
 *
 * The durable-execution spine therefore declares the handoff seam here and
 * the host that owns the Code runtime registers the implementation. Behaviour
 * is unchanged; only the direction of the import is.
 */

import type {
  CodingAgentRun,
  CodingAuditLog,
  CodingPatch,
  CodingPermissionMode,
  CodingToolCall,
  CiProvider,
  CiStatus,
  ExecutionTarget,
  RunEvent,
} from "@ethen/contracts/coding/runtime-types";

export interface CreateCodingRunInput {
  title: string;
  prompt: string;
  mode?: CodingPermissionMode;
  executionTarget?: ExecutionTarget;
  userId?: string;
}

export interface SandboxStrategyState {
  status: string;
  summary: string;
  candidates: Array<{
    candidate: string;
    label: string;
    status: string;
    note: string;
  }>;
  limitations: string[];
}

export interface CodingHandoffRuntime {
  createRun(input: CreateCodingRunInput): Promise<CodingAgentRun>;
  buildCiStatus(repoRoot: string, provider?: CiProvider | null): CiStatus;
  listCodingRuns(): Promise<CodingAgentRun[]>;
  getCodingRun(id: string): Promise<CodingAgentRun | null>;
  getCodingRunEvents(id: string): Promise<RunEvent[]>;
  getCodingToolCalls(id: string): Promise<CodingToolCall[]>;
  getCodingAuditLogs(id: string): Promise<CodingAuditLog[]>;
  getCodingPatches(id: string): Promise<CodingPatch[]>;
  getCurrentSandboxStrategy(): SandboxStrategyState;
}

let runtime: CodingHandoffRuntime | null = null;

/** Register the host's Code runtime. Call once, before a handoff is approved. */
export function registerCodingHandoffRuntime(impl: CodingHandoffRuntime): void {
  runtime = impl;
}

function required(): CodingHandoffRuntime {
  if (!runtime) {
    throw new Error(
      "No coding handoff runtime registered. The host must call registerCodingHandoffRuntime() before a handoff creates a Code run.",
    );
  }
  return runtime;
}

export function createRun(input: CreateCodingRunInput): Promise<CodingAgentRun> {
  return required().createRun(input);
}

export function buildCiStatus(repoRoot: string, provider?: CiProvider | null): CiStatus {
  return required().buildCiStatus(repoRoot, provider);
}

export function listCodingRuns(): Promise<CodingAgentRun[]> {
  return required().listCodingRuns();
}

export function getCodingRun(id: string): Promise<CodingAgentRun | null> {
  return required().getCodingRun(id);
}

export function getCodingRunEvents(id: string): Promise<RunEvent[]> {
  return required().getCodingRunEvents(id);
}

export function getCodingToolCalls(id: string): Promise<CodingToolCall[]> {
  return required().getCodingToolCalls(id);
}

export function getCodingAuditLogs(id: string): Promise<CodingAuditLog[]> {
  return required().getCodingAuditLogs(id);
}

export function getCodingPatches(id: string): Promise<CodingPatch[]> {
  return required().getCodingPatches(id);
}

export function getCurrentSandboxStrategy(): SandboxStrategyState {
  return required().getCurrentSandboxStrategy();
}
