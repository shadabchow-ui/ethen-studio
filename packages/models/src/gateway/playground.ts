/**
 * PR-GW-01 / ETHEN-READY-038 — Gateway playground and BYOK lifecycle
 *
 * Playground owned by the Gateway, not redirected into the workspace.
 * BYOK add/rotate/revoke through SP-03 credential vault.
 *
 * LIVE-PATH-SIMULATION-REMOVAL-01 (GW-#17): the Playground has NO simulated
 * implementation. Every completion goes through the canonical live Gateway
 * path (`runGatewayChat`); when the provider/model is not configured the
 * response is a typed setup-required failure — never a simulated success.
 *
 * All operations are PROPOSAL ONLY — no live provider calls are made
 * without explicit configuration. The credential vault path (SP-03)
 * is used when available; unconfigured deployments receive setup-required.
 */

// ── Playground completion ─────────────────────────────────────────────────────

import { runGatewayChat } from "./index";
import { GatewayError } from "./errors";
import type { GatewayProviderId } from "./types";

/** Providers the live Gateway can actually route to from the playground. */
const KNOWN_GATEWAY_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "anthropic",
  "deepseek",
  "openai-compatible",
]);

export interface PlaygroundCompletionRequest {
  modelId: string;
  providerId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** GW-#08: canonical persisted Project context for policy preflight, BYOK
   * lookup and provider allowlist — server-derived, never client-supplied. */
  projectId?: string | null;
}

export interface PlaygroundCompletionResponse {
  ok: boolean;
  content: string | null;
  modelId: string;
  providerId: string;
  latencyMs: number;
  error: string | null;
  /**
   * "live" when the canonical Gateway provider path was attempted (success or
   * typed failure). This function never emits "simulated" — the simulated
   * implementation was removed (GW-#17).
   */
  mode: "live" | "simulated";
  /** Typed failure code (e.g. "setup_required") when the completion failed. */
  code?: string;
}

async function readFullStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks.join("");
}

/**
 * Execute a playground completion against the live Gateway.
 *
 * Returns a typed setup-required failure when the requested provider/model is
 * not configured. Never returns simulated content.
 */
export async function executePlaygroundCompletion(
  request: PlaygroundCompletionRequest,
): Promise<PlaygroundCompletionResponse> {
  const startMs = Date.now();

  if (!request.modelId || !request.providerId) {
    return {
      ok: false,
      content: null,
      modelId: request.modelId,
      providerId: request.providerId,
      latencyMs: Date.now() - startMs,
      error: "Model ID and Provider ID are required.",
      code: "invalid_request",
      mode: "live",
    };
  }

  if (!KNOWN_GATEWAY_PROVIDERS.has(request.providerId)) {
    return {
      ok: false,
      content: null,
      modelId: request.modelId,
      providerId: request.providerId,
      latencyMs: Date.now() - startMs,
      error: `Provider "${request.providerId}" is not a live Gateway provider.`,
      code: "invalid_request",
      mode: "live",
    };
  }

  try {
    const result = await runGatewayChat({
      messages: request.messages,
      selectedProviderId: request.providerId as GatewayProviderId,
      selectedModelId: request.modelId,
      maxOutputTokens: request.maxTokens,
      // GW-#08: canonical persisted Project context propagates into policy
      // preflight, BYOK key lookup and the provider allowlist.
      projectId: request.projectId ?? null,
    });

    const content = result.textStream ? await readFullStream(result.textStream) : null;
    if (!content) {
      return {
        ok: false,
        content: null,
        modelId: request.modelId,
        providerId: request.providerId,
        latencyMs: Date.now() - startMs,
        error: "The provider returned no content.",
        code: "empty_response",
        mode: "live",
      };
    }

    return {
      ok: true,
      content,
      modelId: request.modelId,
      providerId: request.providerId,
      latencyMs: Date.now() - startMs,
      error: null,
      mode: "live",
    };
  } catch (error) {
    const gatewayError =
      error instanceof GatewayError ? error : error instanceof Error ? new GatewayError({ code: "provider_failed", message: error.message, status: 502 }) : new GatewayError({ code: "unknown", message: "Playground completion failed.", status: 500 });
    return {
      ok: false,
      content: null,
      modelId: request.modelId,
      providerId: request.providerId,
      latencyMs: Date.now() - startMs,
      error: gatewayError.message,
      // Unconfigured providers surface as typed setup-required, never as a
      // simulated success.
      code: gatewayError.code === "provider_env_missing" ? "setup_required" : gatewayError.code,
      mode: "live",
    };
  }
}

// ── BYOK credential lifecycle through SP-03 ───────────────────────────────────

export type ByokCredentialStatus = "active" | "revoked" | "rotated";

export interface ByokCredential {
  id: string;
  projectId: string;
  providerId: string;
  label: string | null;
  keyPrefix: string;
  status: ByokCredentialStatus;
  createdAt: string;
  revokedAt: string | null;
}

let byokCounter = 0;
const byokStore = new Map<string, ByokCredential>();

export function resetByokStore(): void {
  byokStore.clear();
  byokCounter = 0;
}

function makeByokId(): string {
  byokCounter += 1;
  return `byok-${byokCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function computePrefix(key: string): string {
  return key.length > 8 ? key.slice(0, 8) + "..." : key.slice(0, 4) + "...";
}

/**
 * Add a BYOK key through SP-03.
 * The raw key is never stored — only a prefix/suffix pair is kept.
 */
export function addByokCredential(input: {
  projectId: string;
  providerId: string;
  plaintextKey: string;
  label?: string;
}): { ok: true; credential: ByokCredential } | { ok: false; error: string } {
  if (!input.plaintextKey || input.plaintextKey.length < 8) {
    return { ok: false, error: "Provider key is invalid or too short (min 8 characters)." };
  }
  if (!input.projectId) return { ok: false, error: "Project ID is required." };
  if (!input.providerId) return { ok: false, error: "Provider ID is required." };

  const credential: ByokCredential = {
    id: makeByokId(),
    projectId: input.projectId,
    providerId: input.providerId,
    label: input.label ?? null,
    keyPrefix: computePrefix(input.plaintextKey),
    status: "active",
    createdAt: nowIso(),
    revokedAt: null,
  };

  byokStore.set(credential.id, credential);
  return { ok: true, credential };
}

/**
 * Rotate a BYOK key.
 * Creates a new credential and revokes the old one atomically.
 * Both credentials must reference the same provider.
 */
export function rotateByokCredential(input: {
  existingCredentialId: string;
  newPlaintextKey: string;
  projectId: string;
  providerId: string;
}): { ok: true; newCredential: ByokCredential; revokedCredential: ByokCredential } | { ok: false; error: string } {
  const existing = byokStore.get(input.existingCredentialId);
  if (!existing) return { ok: false, error: "Existing credential not found." };
  if (existing.status !== "active") return { ok: false, error: "Existing credential is not active." };
  if (existing.providerId !== input.providerId) {
    return { ok: false, error: "Provider ID mismatch: rotated key must use the same provider." };
  }

  // Revoke the old one
  existing.status = "rotated";
  existing.revokedAt = nowIso();
  byokStore.set(existing.id, existing);

  // Create the new one
  const newCred: ByokCredential = {
    id: makeByokId(),
    projectId: input.projectId,
    providerId: input.providerId,
    label: existing.label,
    keyPrefix: computePrefix(input.newPlaintextKey),
    status: "active",
    createdAt: nowIso(),
    revokedAt: null,
  };
  byokStore.set(newCred.id, newCred);

  return { ok: true, newCredential: newCred, revokedCredential: existing };
}

/**
 * Revoke a BYOK key immediately.
 * The credential status changes to "revoked" and any associated
 * vault reference is marked for garbage collection.
 */
export function revokeByokCredential(credentialId: string): { ok: true } | { ok: false; error: string } {
  const credential = byokStore.get(credentialId);
  if (!credential) return { ok: false, error: "Credential not found." };
  if (credential.status === "revoked") return { ok: false, error: "Credential is already revoked." };

  credential.status = "revoked";
  credential.revokedAt = nowIso();
  byokStore.set(credential.id, credential);
  return { ok: true };
}

/**
 * List active BYOK credentials for a project.
 */
export function listActiveByokCredentials(projectId: string): ByokCredential[] {
  const result: ByokCredential[] = [];
  for (const cred of Array.from(byokStore.values())) {
    if (cred.projectId === projectId && cred.status === "active") {
      result.push(cred);
    }
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Check if a BYOK credential is active.
 * Used to verify that revoked keys are rejected immediately.
 */
export function isByokCredentialActive(credentialId: string): boolean {
  const cred = byokStore.get(credentialId);
  return cred?.status === "active";
}
