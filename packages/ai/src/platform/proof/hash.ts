import { createHash } from "node:crypto";

export function hashProofBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashPolicySnapshot(snapshot: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(snapshot), "utf8")
    .digest("hex");
}
