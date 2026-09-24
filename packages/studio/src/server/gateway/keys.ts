/** Studio V5 gateway — scoped API keys (STUDIO_19). Server-only. */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { TaskName } from "../../contracts/tasks";
import { gatewayError, type ApiKeyMetadata, type ApiKeyRecord, type KeyScope } from "./types";

export const GATEWAY_KEY_SECRET_PREFIX = "ethsk_";
const SECRET_BYTES = 32;
const KEY_ID_BYTES = 9;

function newId(prefix: string, bytes: number): string {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

/** SHA-256 hex of the full secret. Only the hash is stored. */
export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Display prefix: first 8 chars of the secret body, never the whole secret. */
export function prefixOfSecret(secret: string): string {
  return secret.slice(GATEWAY_KEY_SECRET_PREFIX.length, GATEWAY_KEY_SECRET_PREFIX.length + 8);
}

export function safeEqualHash(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function parseBearerSecret(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(\S+)$/.exec(headerValue.trim());
  if (!match) return null;
  const secret = match[1] ?? "";
  if (!secret.startsWith(GATEWAY_KEY_SECRET_PREFIX)) return null;
  if (secret.length < GATEWAY_KEY_SECRET_PREFIX.length + 16) return null;
  return secret;
}

export interface MintKeyInput {
  tenantId: string;
  name: string;
  scope: KeyScope;
  createdBy: string;
  expiresAt?: string | null;
  rotatedFromKeyId?: string | null;
  legacyOrigin?: string | null;
  nowIso?: string;
}

function assertScope(scope: KeyScope): void {
  if (scope.projects.length === 0 || scope.tasks.length === 0) {
    throw gatewayError("BAD_REQUEST", "Key scope must list at least one project and one task.");
  }
  for (const project of scope.projects) {
    if (project !== "*" && project.trim().length === 0) {
      throw gatewayError("BAD_REQUEST", "Key project scope entries must be non-empty.");
    }
  }
}

/**
 * Mint a scoped key. Returns the record (hash only) plus the plaintext
 * secret exactly once — callers must reveal-and-drop it, never persist it.
 */
export function mintApiKey(input: MintKeyInput): { record: ApiKeyRecord; secret: string } {
  if (!input.tenantId.trim()) throw gatewayError("BAD_REQUEST", "tenantId is required.");
  if (!input.name.trim()) throw gatewayError("BAD_REQUEST", "Key name is required.");
  if (!input.createdBy.trim()) throw gatewayError("BAD_REQUEST", "createdBy is required.");
  assertScope(input.scope);
  const secret = `${GATEWAY_KEY_SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString("hex")}`;
  const now = input.nowIso ?? new Date().toISOString();
  if (input.expiresAt && !Number.isFinite(Date.parse(input.expiresAt))) {
    throw gatewayError("BAD_REQUEST", "expiresAt is not a valid timestamp.");
  }
  const record: ApiKeyRecord = {
    keyId: newId("key", KEY_ID_BYTES),
    tenantId: input.tenantId,
    name: input.name.trim(),
    keyHash: hashApiKeySecret(secret),
    prefix: prefixOfSecret(secret),
    scope: { projects: [...input.scope.projects], tasks: [...input.scope.tasks] },
    createdBy: input.createdBy,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    rotatedFromKeyId: input.rotatedFromKeyId ?? null,
    legacyOrigin: input.legacyOrigin ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return { record, secret };
}

export function keyMetadata(record: ApiKeyRecord): ApiKeyMetadata {
  return {
    keyId: record.keyId,
    name: record.name,
    prefix: record.prefix,
    scope: record.scope,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    rotatedFromKeyId: record.rotatedFromKeyId,
    createdAt: record.createdAt,
  };
}

/** Reject revoked/expired keys. Throws UNAUTHORIZED/FORBIDDEN, never details. */
export function assertKeyUsable(record: ApiKeyRecord, nowIso?: string): void {
  if (record.revokedAt) {
    throw gatewayError("UNAUTHORIZED", "API key is revoked.");
  }
  if (record.expiresAt) {
    const nowMs = Date.parse(nowIso ?? new Date().toISOString());
    if (nowMs >= Date.parse(record.expiresAt)) {
      throw gatewayError("UNAUTHORIZED", "API key is expired.");
    }
  }
}

export function keyAllowsProject(record: ApiKeyRecord, projectId: string): boolean {
  return record.scope.projects.includes("*") || record.scope.projects.includes(projectId);
}

export function keyAllowsTask(record: ApiKeyRecord, task: TaskName | string): boolean {
  return record.scope.tasks.includes("*") || record.scope.tasks.includes(task);
}

/** Enforce tenant binding plus project/task scope. Cross-tenant is denied. */
export function assertKeyScope(
  record: ApiKeyRecord,
  input: { tenantId: string; projectId: string; task: TaskName | string },
): void {
  if (record.tenantId !== input.tenantId) {
    throw gatewayError("FORBIDDEN", "API key is not valid for this tenant.");
  }
  if (!keyAllowsProject(record, input.projectId)) {
    throw gatewayError("FORBIDDEN", "API key is not scoped to this project.");
  }
  if (!keyAllowsTask(record, input.task)) {
    throw gatewayError("FORBIDDEN", "API key is not scoped to this task.");
  }
}
