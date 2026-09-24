/** Studio V5 economics — quota claims in ICU (STUDIO_04). Server-only. */
import "server-only";
import { asIcu, ZERO_ICU, type IcuAmount } from "../../contracts/money";
import { EconomicsError, type QuotaClaim, type QuotaPolicy } from "./types";

export interface QuotaPort {
  claim(projectId: string, icu: IcuAmount): Promise<QuotaClaim>;
  release(projectId: string): Promise<QuotaClaim>;
  releaseDuplicate(projectId: string, icu: IcuAmount): Promise<QuotaClaim>;
}

/**
 * Memory quota adapter. Mirrors the j04 SQL guards field-for-field:
 * unconfigured/disabled denies, concurrency and daily-ICU breaches deny,
 * release frees the slot only (spend stays consumed), duplicate rollback
 * restores slot + advisory counter. Single-process only.
 */
export class MemoryQuotaService implements QuotaPort {
  private readonly policies = new Map<string, QuotaPolicy>();
  private readonly claims = new Map<string, QuotaClaim>();

  setPolicy(policy: QuotaPolicy): void {
    this.policies.set(policy.projectId, { ...policy });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private row(projectId: string): QuotaClaim {
    const existing = this.claims.get(projectId);
    if (existing && existing.windowStart === this.today()) return existing;
    const fresh: QuotaClaim = {
      projectId,
      windowStart: this.today(),
      concurrentCount: 0,
      icuConsumed: ZERO_ICU,
    };
    this.claims.set(projectId, fresh);
    return fresh;
  }

  private policyFor(projectId: string): QuotaPolicy {
    const policy = this.policies.get(projectId);
    if (!policy) throw new EconomicsError("QUOTA_UNCONFIGURED", "No Studio quota policy for this project.");
    if (!policy.enforced) throw new EconomicsError("QUOTA_DISABLED", "Studio quota enforcement is disabled for this project.");
    return policy;
  }

  async claim(projectId: string, icu: IcuAmount): Promise<QuotaClaim> {
    if (!Number.isInteger(icu) || icu < 0) {
      throw new EconomicsError("INVALID_INPUT", "Quota claim must be a non-negative ICU integer.");
    }
    const policy = this.policyFor(projectId);
    const row = this.row(projectId);
    if (row.concurrentCount + 1 > policy.maxConcurrentJobs) {
      throw new EconomicsError("QUOTA_CONCURRENCY", "Too many concurrent Studio jobs for this project.");
    }
    if (row.icuConsumed + icu > policy.dailyIcu) {
      throw new EconomicsError("QUOTA_EXCEEDED", "Daily Studio credit quota exceeded for this project.");
    }
    const next: QuotaClaim = {
      ...row,
      concurrentCount: row.concurrentCount + 1,
      icuConsumed: asIcu(row.icuConsumed + icu),
    };
    this.claims.set(projectId, next);
    return { ...next };
  }

  async release(projectId: string): Promise<QuotaClaim> {
    const row = this.row(projectId);
    const next: QuotaClaim = { ...row, concurrentCount: Math.max(0, row.concurrentCount - 1) };
    this.claims.set(projectId, next);
    return { ...next };
  }

  async releaseDuplicate(projectId: string, icu: IcuAmount): Promise<QuotaClaim> {
    if (!Number.isInteger(icu) || icu < 0) {
      throw new EconomicsError("INVALID_INPUT", "Quota rollback must be a non-negative ICU integer.");
    }
    const row = this.row(projectId);
    const next: QuotaClaim = {
      ...row,
      concurrentCount: Math.max(0, row.concurrentCount - 1),
      icuConsumed: asIcu(Math.max(0, row.icuConsumed - icu)),
    };
    this.claims.set(projectId, next);
    return { ...next };
  }

  peek(projectId: string): QuotaClaim {
    return { ...this.row(projectId) };
  }
}

/** Best-effort terminal release. Hygiene only; never throws. */
export async function tryReleaseQuota(quota: QuotaPort | undefined, projectId: string): Promise<boolean> {
  if (!quota) return false;
  try {
    await quota.release(projectId);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort duplicate-claim rollback for admission retries. Never throws. */
export async function tryReleaseDuplicateQuota(
  quota: QuotaPort | undefined,
  projectId: string,
  icu: IcuAmount,
): Promise<boolean> {
  if (!quota) return false;
  try {
    await quota.releaseDuplicate(projectId, icu);
    return true;
  } catch {
    return false;
  }
}
