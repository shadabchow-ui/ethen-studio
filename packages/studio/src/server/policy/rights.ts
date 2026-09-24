/** Studio V5 policy — rights assertions (STUDIO_03, server-only). */
import "server-only";
import { randomUUID } from "node:crypto";
import { serializeScope, type ProjectScope } from "../../contracts/scope";
import { policyError } from "./types";
import type { PolicyAssetClass, RightsAssertion, RightsAssertionInput } from "./types";

export interface RightsRepository {
  assertRights(scope: ProjectScope, input: RightsAssertionInput): Promise<RightsAssertion>;
  getAssertion(scope: ProjectScope, assertionId: string): Promise<RightsAssertion | null>;
  listAssertionsForAsset(scope: ProjectScope, assetId: string): Promise<readonly RightsAssertion[]>;
}

const ASSET_CLASSES: readonly PolicyAssetClass[] = [
  "image",
  "video",
  "audio",
  "music",
  "transcript",
  "document",
  "package",
];

/** Latest assertion wins; version-specific rows beat asset-wide rows. */
export function selectRightsAssertion(
  rows: readonly RightsAssertion[],
  assetVersion: number | null,
): RightsAssertion | null {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => {
    const aSpecific = a.assetVersion !== null && a.assetVersion === assetVersion ? 0 : 1;
    const bSpecific = b.assetVersion !== null && b.assetVersion === assetVersion ? 0 : 1;
    if (aSpecific !== bSpecific) return aSpecific - bSpecific;
    return b.assertedAt.localeCompare(a.assertedAt);
  });
  const head = ranked[0];
  // A version-specific row for a different version does not cover this read.
  if (head.assetVersion !== null && assetVersion !== null && head.assetVersion !== assetVersion) {
    const wide = ranked.find((r) => r.assetVersion === null);
    return wide ?? null;
  }
  return head;
}

/** In-memory store. Production binds Supabase-backed adapters. */
export class MemoryRightsRepository implements RightsRepository {
  private readonly rows = new Map<string, RightsAssertion>();

  private key(scope: ProjectScope, id: string): string {
    return `${serializeScope(scope)}:${id}`;
  }

  async assertRights(
    scope: ProjectScope,
    input: RightsAssertionInput,
    now?: string,
  ): Promise<RightsAssertion> {
    if (!input.assetId.trim()) throw policyError("BAD_REQUEST", "assetId is required.");
    if (!ASSET_CLASSES.includes(input.assetClass)) {
      throw policyError("BAD_REQUEST", "assetClass is unknown.");
    }
    if (!input.assertedBy.trim()) throw policyError("BAD_REQUEST", "assertedBy is required.");
    if (input.assetVersion !== undefined && input.assetVersion !== null) {
      if (!Number.isInteger(input.assetVersion) || input.assetVersion <= 0) {
        throw policyError("BAD_REQUEST", "assetVersion must be a positive integer.");
      }
    }
    if (input.expiresAt !== undefined && input.expiresAt !== null && Number.isNaN(Date.parse(input.expiresAt))) {
      throw policyError("BAD_REQUEST", "expiresAt must be an ISO timestamp.");
    }
    const row: RightsAssertion = {
      assertionId: randomUUID(),
      scope,
      assetId: input.assetId,
      assetVersion: input.assetVersion ?? null,
      assetClass: input.assetClass,
      status: input.status,
      commercialUse: input.commercialUse ?? null,
      exportAllowed: input.exportAllowed ?? null,
      channels: [...(input.channels ?? [])],
      licenseRef: input.licenseRef ?? null,
      assertedBy: input.assertedBy,
      assertedAt: now ?? new Date().toISOString(),
      expiresAt: input.expiresAt ?? null,
      provenance: input.provenance ?? "studio_v5",
      note: input.note ?? null,
    };
    this.rows.set(this.key(scope, row.assertionId), row);
    return row;
  }

  async getAssertion(scope: ProjectScope, assertionId: string): Promise<RightsAssertion | null> {
    return this.rows.get(this.key(scope, assertionId)) ?? null;
  }

  async listAssertionsForAsset(scope: ProjectScope, assetId: string): Promise<readonly RightsAssertion[]> {
    const prefix = `${serializeScope(scope)}:`;
    const rows: RightsAssertion[] = [];
    for (const [key, row] of this.rows) {
      if (key.startsWith(prefix) && row.assetId === assetId) rows.push(row);
    }
    rows.sort((a, b) => a.assertedAt.localeCompare(b.assertedAt));
    return rows;
  }
}
