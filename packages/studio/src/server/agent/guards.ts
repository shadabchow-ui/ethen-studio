/**
 * Studio V5 Creative Agent — boundaries: tiers, budgets, injection,
 * publish gate, verify/repair bound (STUDIO_17).
 *
 * Tier escalation is human-only. Reference/transcript content is
 * untrusted input: injection patterns quarantine (blocked + surfaced),
 * never execute, and can never raise a tier or widen spend. Verify
 * failures get a bounded number of repairs, then stop for a human.
 */
import "server-only";
import { addIcu, ZERO_ICU, type IcuAmount } from "../../contracts/money";
import {
  DEFAULT_INVESTIGATION_BUDGET,
  agentError,
  tierRank,
  type AgentPublishPort,
  type AgentRun,
  type ExecutionTier,
  type InvestigationBudget,
  type TierActor,
  type VerifyCheck,
  type VerifyState,
} from "./types";

export function createInvestigationBudget(internalCeilingIcu: IcuAmount): InvestigationBudget {
  return {
    maxPlanningPasses: DEFAULT_INVESTIGATION_BUDGET.maxPlanningPasses,
    maxToolCalls: DEFAULT_INVESTIGATION_BUDGET.maxToolCalls,
    internalCeilingIcu,
    planningPassesUsed: 0,
    toolCallsUsed: 0,
    internalSpentIcu: ZERO_ICU,
  };
}

export type BudgetOutcome = { ok: true } | { ok: false; reason: string };

/** Record one planning pass. Exhaustion asks the user; never debits them. */
export function recordPlanningPass(budget: InvestigationBudget): BudgetOutcome {
  if (budget.planningPassesUsed >= budget.maxPlanningPasses) {
    return {
      ok: false,
      reason: `Planning budget exhausted (${budget.maxPlanningPasses} passes). Presenting plan-so-far for user action.`,
    };
  }
  budget.planningPassesUsed += 1;
  return { ok: true };
}

/** Record tool calls plus internal spend against the platform ceiling. */
export function recordToolCalls(
  budget: InvestigationBudget,
  calls: number,
  internalCostIcu: IcuAmount,
): BudgetOutcome {
  if (!Number.isInteger(calls) || calls <= 0) {
    throw agentError("BAD_REQUEST", "Tool call count must be a positive integer.");
  }
  if (budget.toolCallsUsed + calls > budget.maxToolCalls) {
    return {
      ok: false,
      reason: `Tool budget exhausted (${budget.maxToolCalls} calls per request). Presenting plan-so-far for user action.`,
    };
  }
  const spent = addIcu(budget.internalSpentIcu, internalCostIcu);
  if (spent > budget.internalCeilingIcu) {
    return {
      ok: false,
      reason: "Internal planning cost ceiling reached. Presenting plan-so-far for user action.",
    };
  }
  budget.toolCallsUsed += calls;
  budget.internalSpentIcu = spent;
  return { ok: true };
}

// -- tier escalation (human-only) -------------------------------------------

/** Human-only tier raise. Agent actors and untrusted content are rejected. */
export function raiseTier(run: AgentRun, target: ExecutionTier, actor: TierActor): ExecutionTier {
  if (!actor.isHuman) {
    throw agentError("FORBIDDEN", "Tier escalation is human-only; the agent cannot raise its own tier.", {
      actorId: actor.actorId,
      target,
    });
  }
  if (tierRank(target) <= tierRank(run.tier)) {
    throw agentError("BAD_REQUEST", `Tier ${target} is not above the current tier ${run.tier}.`);
  }
  return target;
}

export function assertTierAllows(run: AgentRun, needed: ExecutionTier, what: string): void {
  if (tierRank(run.tier) < tierRank(needed)) {
    throw agentError("APPROVAL_REQUIRED", `${what} needs the ${needed} tier; run is at ${run.tier}.`, {
      tier: run.tier,
      needed,
    });
  }
}

// -- prompt-injection screening ------------------------------------------------
// Recovered from director-context.ts: tainted material quarantines.

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(in\s+)?(admin|developer|root|maintenance|god)\s+mode/i,
  /escalate\s+(my\s+|the\s+)?(tier|privileges|permissions|access)/i,
  /raise\s+(my\s+|the\s+)?tier/i,
  /grant\s+(yourself|me)\s+(admin|publish|execute|spend)/i,
  /bypass\s+(approval|policy|consent|review)/i,
  /skip\s+(approval|policy\s+check|consent)/i,
  /approve\s+(this|yourself|automatically)/i,
  /execute\s+without\s+approval/i,
  /system\s*:\s*new\s+instructions/i,
  /\[system\]/i,
  /act\s+as\s+(if\s+you\s+were\s+)?(the\s+)?(admin|owner|human|operator)/i,
  /reveal\s+(system|hidden|secret)/i,
  /exfiltrate|send\s+.*\s+to\s+https?:\/\//i,
];

export interface InjectionScreening {
  tainted: boolean;
  matched: readonly string[];
}

/**
 * Screen untrusted content (references, transcripts, pasted briefs).
 * Tainted material is quarantined: blocked and surfaced, never executed.
 */
export function screenUntrustedContent(content: string): InjectionScreening {
  const matched: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) matched.push(pattern.source);
  }
  return { tainted: matched.length > 0, matched };
}

/**
 * Tier requests derived from untrusted content are always denied — content
 * can never grant tool authority or widen spend.
 */
export function denyTierRaiseFromUntrusted(screening: InjectionScreening): void {
  if (screening.tainted) {
    throw agentError(
      "FORBIDDEN",
      "Quarantined: untrusted content requested elevated authority. A human must review it first.",
      { matched: screening.matched },
    );
  }
}

// -- publish gate ---------------------------------------------------------------

export interface PublishGateInput {
  channel: string;
  assetClass: string;
  authorityId: string | null;
  /** Fresh granted publish approval, when present. */
  publishApprovalGranted: boolean;
  now: string;
}

export type PublishGateResult =
  | { allowed: true; via: "approval" | "authority"; authorityId: string | null }
  | { allowed: false; reason: string };

/**
 * Public publish needs a fresh publish approval OR a live scoped
 * PublishAuthority (channel + asset class match, unexpired, uses left,
 * unrevoked). Expiry denies; consumption is exactly-once via the port.
 */
export async function checkPublishGate(
  port: AgentPublishPort,
  input: PublishGateInput,
): Promise<PublishGateResult> {
  if (input.publishApprovalGranted) {
    return { allowed: true, via: "approval", authorityId: null };
  }
  if (!input.authorityId) {
    return { allowed: false, reason: "Public publish needs an approval or a scoped publish authority." };
  }
  const authority = await port.getAuthority(input.authorityId);
  if (!authority) return { allowed: false, reason: "Publish authority was not found." };
  if (authority.revokedAt) return { allowed: false, reason: "Publish authority was revoked." };
  if (authority.expiresAt <= input.now) return { allowed: false, reason: "Publish authority expired." };
  if (authority.channel !== input.channel) {
    return { allowed: false, reason: `Publish authority covers channel ${authority.channel}, not ${input.channel}.` };
  }
  if (authority.assetClass !== "*" && authority.assetClass !== input.assetClass) {
    return { allowed: false, reason: "Publish authority does not cover this asset class." };
  }
  if (authority.maxUses !== null && authority.usedCount >= authority.maxUses) {
    return { allowed: false, reason: "Publish authority use limit is exhausted." };
  }
  const consumed = await port.consumeAuthority(authority.authorityId);
  if (!consumed) return { allowed: false, reason: "Publish authority could not be consumed; retry." };
  return { allowed: true, via: "authority", authorityId: authority.authorityId };
}

// -- verify / repair bound -------------------------------------------------------

export function recordVerifyChecks(
  verify: VerifyState,
  checks: readonly VerifyCheck[],
): { allPassed: boolean } {
  const next: VerifyState = { ...verify, checks: [...checks] };
  Object.assign(verify, next);
  return { allPassed: checks.every((c) => c.passed) };
}

/**
 * Start a bounded repair after verify failure. Beyond the bound the run
 * must block for a human — no unbounded repair loops.
 */
export function startVerifyRepair(verify: VerifyState): void {
  if (verify.checks.every((c) => c.passed)) {
    throw agentError("BAD_REQUEST", "Verification passed; no repair is needed.");
  }
  if (verify.repairsUsed >= verify.maxRepairs) {
    throw agentError(
      "CONFLICT",
      `Verify repair bound reached (${verify.maxRepairs}); a human must intervene.`,
      { repairsUsed: verify.repairsUsed, maxRepairs: verify.maxRepairs },
    );
  }
  verify.repairsUsed += 1;
}
