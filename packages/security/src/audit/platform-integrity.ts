import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuditLogEntry } from "./platform-types";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function canonicalAuditEvent(entry: AuditLogEntry): string {
  const { previousHash = null, entryHash: _entryHash, ...event } = entry;
  return canonical({ ...event, previousHash });
}

export function hashAuditEvent(entry: AuditLogEntry): string {
  return createHash("sha256").update(canonicalAuditEvent(entry)).digest("hex");
}

export function verifyAuditChain(entries: readonly AuditLogEntry[]): { valid: boolean; reason?: string } {
  let previousHash: string | null = null;
  for (const entry of entries) {
    if ((entry.previousHash ?? null) !== previousHash) return { valid: false, reason: `previous hash mismatch at ${entry.id}` };
    if (!entry.entryHash || entry.entryHash !== hashAuditEvent(entry)) return { valid: false, reason: `entry hash mismatch at ${entry.id}` };
    previousHash = entry.entryHash;
  }
  return { valid: true };
}

export function signAuditPayload(payload: string, key?: string): { status: "unsigned"; signature: null } | { status: "signed"; signature: string } {
  if (!key) return { status: "unsigned", signature: null };
  return { status: "signed", signature: `hmac-sha256:${createHmac("sha256", key).update(payload).digest("hex")}` };
}

export function verifyAuditSignature(payload: string, signature: string | null, key?: string): boolean {
  if (!key || !signature?.startsWith("hmac-sha256:")) return false;
  const expected = signAuditPayload(payload, key);
  if (expected.status !== "signed") return false;
  return timingSafeEqual(Buffer.from(expected.signature), Buffer.from(signature));
}
