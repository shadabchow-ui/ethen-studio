/**
 * Studio V2 Job 06 — director context resolution.
 * Assembles the frozen-vs-current comparison a plan needs before paid or
 * sensitive dispatch: document revisions, lock digests, consent validity,
 * budget remainder, and reference existence. Mutable facts are re-checked
 * at dispatch; anything moved blocks with an explicit reason.
 * Uploaded material is screened for prompt-injection patterns: tainted
 * material quarantines (blocked + surfaced), never silently executed.
 */

import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import type { FrozenEnvelope } from "./director-plan";

export interface ResolvedDirectorContext {
  docRevisions: Record<string, number>;
  lockDigests: Record<string, string>;
  consentIds: string[];
  spentCredits: number;
  blockers: string[];
}

/** Consent lifecycles that count as currently granted. */
const GRANTED_CONSENT_LIFECYCLES = new Set(["active", "granted", "approved"]);

function docKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Resolve current context against an accepted plan's frozen envelope.
 * Returns blockers for every moved mutable fact; empty blockers means the
 * frozen world still holds.
 */
export async function resolveDirectorContext(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  frozen: FrozenEnvelope,
  taskQuotes: Record<string, number> = {},
): Promise<ResolvedDirectorContext> {
  const blockers: string[] = [];
  const docRevisions: Record<string, number> = {};
  const lockDigests: Record<string, string> = {};

  const [briefs, deliverables, specs, locks, consents, plans] = await Promise.all([
    repo.list(scope, "studio_briefs").catch(() => []),
    repo.list(scope, "studio_deliverables").catch(() => []),
    repo.list(scope, "studio_creative_direction_specs").catch(() => []),
    repo.list(scope, "studio_decision_locks").catch(() => []),
    repo.list(scope, "studio_consents").catch(() => []),
    repo.list(scope, "studio_director_plans").catch(() => []),
  ]);
  const docs = [...briefs, ...deliverables, ...specs];
  for (const doc of docs) {
    const data = doc.payload as Record<string, unknown>;
    const table = doc.table;
    const kind = table === "studio_briefs" ? "brief" : table === "studio_deliverables" ? "deliverable" : "direction_spec";
    docRevisions[docKey(kind, doc.id)] = typeof data.revision === "number" ? data.revision : 1;
  }
  for (const row of locks) {
    const data = row.payload as Record<string, unknown>;
    if ((data.superseded_by ?? null) !== null) continue;
    lockDigests[docKey(String(data.entity_kind ?? ""), String(data.entity_id ?? ""))] = String(data.payload_hash ?? "");
  }
  for (const [key, revision] of Object.entries(frozen.docRevisions ?? {})) {
    if (docRevisions[key] === undefined) {
      blockers.push(`stale-revision: frozen document ${key} is gone`);
    } else if (docRevisions[key] !== revision) {
      blockers.push(`stale-revision: ${key} moved ${revision} -> ${docRevisions[key]}`);
    }
  }
  for (const [key, digest] of Object.entries(frozen.lockDigests ?? {})) {
    if (lockDigests[key] === undefined) {
      blockers.push(`lock-changed: frozen lock ${key} is gone`);
    } else if (lockDigests[key] !== digest) {
      blockers.push(`lock-changed: ${key} digest moved`);
    }
  }
  const consentIds: string[] = [];
  for (const id of frozen.consentIds ?? []) {
    const row = consents.find((entry) => entry.id === id);
    if (!row) {
      blockers.push(`consent-changed: frozen consent ${id.slice(0, 8)}… is gone`);
      continue;
    }
    const data = row.payload as Record<string, unknown>;
    const lifecycle = String(data.lifecycle ?? "");
    const expiresAt = typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
    if (!GRANTED_CONSENT_LIFECYCLES.has(lifecycle)) {
      blockers.push(`consent-changed: consent ${id.slice(0, 8)}… is ${lifecycle || "unset"}`);
      continue;
    }
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      blockers.push(`consent-changed: consent ${id.slice(0, 8)}… expired`);
      continue;
    }
    consentIds.push(id);
  }
  let spentCredits = frozen.spentBaseline ?? 0;
  for (const row of plans) {
    const data = row.payload as Record<string, unknown>;
    const spent = Number(data.spent_credits ?? 0);
    if (Number.isFinite(spent) && spent > spentCredits) spentCredits = spent;
  }
  const plannedSpend = Object.values(taskQuotes).reduce((sum, quote) => sum + (Number.isFinite(quote) ? quote : 0), 0);
  if (spentCredits + plannedSpend > (frozen.budgetCeiling ?? 0)) {
    blockers.push(`budget-exhausted: spent ${spentCredits} + planned ${plannedSpend} exceeds ceiling ${frozen.budgetCeiling ?? 0}`);
  }
  return { docRevisions, lockDigests, consentIds, spentCredits, blockers };
}

/** Snapshot current revisions/digests/consents for freezing at acceptance. */
export async function snapshotDirectorContext(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
): Promise<{ docRevisions: Record<string, number>; lockDigests: Record<string, string>; consentIds: string[]; spentCredits: number }> {
  const [briefs, deliverables, specs, locks, consents, plans] = await Promise.all([
    repo.list(scope, "studio_briefs").catch(() => []),
    repo.list(scope, "studio_deliverables").catch(() => []),
    repo.list(scope, "studio_creative_direction_specs").catch(() => []),
    repo.list(scope, "studio_decision_locks").catch(() => []),
    repo.list(scope, "studio_consents").catch(() => []),
    repo.list(scope, "studio_director_plans").catch(() => []),
  ]);
  const docRevisions: Record<string, number> = {};
  for (const doc of [...briefs, ...deliverables, ...specs]) {
    const data = doc.payload as Record<string, unknown>;
    const kind = doc.table === "studio_briefs" ? "brief" : doc.table === "studio_deliverables" ? "deliverable" : "direction_spec";
    docRevisions[docKey(kind, doc.id)] = typeof data.revision === "number" ? data.revision : 1;
  }
  const lockDigests: Record<string, string> = {};
  for (const row of locks) {
    const data = row.payload as Record<string, unknown>;
    if ((data.superseded_by ?? null) !== null) continue;
    lockDigests[docKey(String(data.entity_kind ?? ""), String(data.entity_id ?? ""))] = String(data.payload_hash ?? "");
  }
  const consentIds = consents.map((row) => row.id);
  let spentCredits = 0;
  for (const row of plans) {
    const spent = Number((row.payload as Record<string, unknown>).spent_credits ?? 0);
    if (Number.isFinite(spent) && spent > spentCredits) spentCredits = spent;
  }
  return { docRevisions, lockDigests, consentIds, spentCredits };
}

// ── Prompt-injection screening ──────────────────────────────────────────
//
// Heuristic screen, not a security boundary: server-side scope, budget, and
// admission enforcement hold regardless. Tainted material is quarantined
// (blocked + surfaced) so a human decides; it is never silently executed.

const INJECTION_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "instruction-override", pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i },
  { name: "instruction-override", pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i },
  { name: "system-role", pattern: /^\s*system\s*:/im },
  { name: "system-role", pattern: /you\s+are\s+now\s+(a\s+)?(system|developer|root|admin)\b/i },
  { name: "prompt-exfil", pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions|initial\s+prompt)/i },
  { name: "prompt-exfil", pattern: /repeat\s+(the\s+)?(system\s+prompt|instructions)\s+verbatim/i },
  { name: "tool-escape", pattern: /bypass\s+(the\s+)?(approval|budget|scope|consent|review)\b/i },
  { name: "tool-escape", pattern: /skip\s+(the\s+)?(approval|budget|scope|consent|review)\s+(check|step|gate)?/i },
];

export interface MaterialScreening {
  tainted: boolean;
  hits: string[];
}

/** Screen uploaded/proposed material for prompt-injection patterns. */
export function screenDirectorMaterial(text: string | null | undefined): MaterialScreening {
  if (!text) return { tainted: false, hits: [] };
  const hits = new Set<string>();
  for (const { name, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(text)) hits.add(name);
  }
  return { tainted: hits.size > 0, hits: [...hits] };
}
