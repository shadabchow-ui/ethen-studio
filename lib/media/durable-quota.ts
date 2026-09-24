/**
 * Studio V2 Job 12 (P0-9) — durable quota/concurrency service.
 *
 * Production adapter over the atomic claim_studio_quota /
 * release_studio_quota_claim RPCs. Fail-closed: missing service client,
 * missing policy, breach, or unknown state all deny via typed errors.
 * Spend authority stays with the canonical credit ledger; this service owns
 * ceilings and concurrency claims only.
 */

import "server-only";

import { createServiceClient } from "@ethen/database/service";

export interface StudioQuotaClaim {
  projectId: string;
  windowStart: string;
  concurrentCount: number;
  creditsConsumed: number;
}

/**
 * Studio V2 Job 12B (Gate C) — quota port.
 * The canonical admission path (`enqueueWithReservation`) depends on this
 * interface, never on a concrete adapter: production passes the durable
 * service below; tests and local runs pass the memory adapter. There is no
 * silent fallback — callers that pass nothing get the durable default and
 * fail closed when it is unconfigured.
 */
export interface StudioQuotaPort {
  claim(projectId: string, credits: number): Promise<StudioQuotaClaim>;
  release(projectId: string): Promise<StudioQuotaClaim>;
  /**
   * Roll back a claim that never became spend (reservation replayed or
   * reserve failed): restores the slot AND the advisory daily counter.
   * Terminal paths must use release(), never this.
   */
  releaseDuplicate(projectId: string, credits: number): Promise<StudioQuotaClaim>;
}

export interface StudioQuotaClient {
  rpc(
    fn: "claim_studio_quota" | "release_studio_quota_claim" | "release_duplicate_studio_quota_claim",
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

function defaultClient(): StudioQuotaClient {
  const client = createServiceClient();
  if (!client) throw new Error("Studio quota service requires a configured service client.");
  return client as unknown as StudioQuotaClient;
}

function mapRow(row: Record<string, unknown>): StudioQuotaClaim {
  return {
    projectId: String(row.project_id ?? ""),
    windowStart: String(row.window_start ?? ""),
    concurrentCount: Number(row.concurrent_count ?? 0),
    creditsConsumed: Number(row.credits_consumed ?? 0),
  };
}

function quotaError(message: string): Error {
  if (/concurrency limit exceeded/i.test(message)) return new Error("STUDIO_QUOTA_CONCURRENCY: too many concurrent Studio jobs for this project.");
  if (/daily credit quota exceeded/i.test(message)) return new Error("STUDIO_QUOTA_EXCEEDED: daily Studio credit quota exceeded for this project.");
  if (/policy not found/i.test(message)) return new Error("STUDIO_QUOTA_UNCONFIGURED: no Studio quota policy for this project.");
  if (/enforcement disabled/i.test(message)) return new Error("STUDIO_QUOTA_DISABLED: Studio quota enforcement is disabled for this project.");
  return new Error(`Studio quota claim failed: ${message}`);
}

export class SupabaseStudioQuotaService implements StudioQuotaPort {
  constructor(private readonly clientFactory: () => StudioQuotaClient = defaultClient) {}

  async claim(projectId: string, credits: number): Promise<StudioQuotaClaim> {
    if (!projectId.trim()) throw new Error("STUDIO_QUOTA_INVALID: projectId is required.");
    if (!Number.isFinite(credits) || credits < 0) throw new Error("STUDIO_QUOTA_INVALID: credits must be >= 0.");
    const { data, error } = await this.clientFactory().rpc("claim_studio_quota", {
      p_project_id: projectId,
      p_credits: Math.floor(credits),
    });
    if (error) throw quotaError(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    if (!row) throw new Error("Studio quota claim is not readable after claim.");
    return mapRow(row);
  }

  async release(projectId: string): Promise<StudioQuotaClaim> {
    if (!projectId.trim()) throw new Error("STUDIO_QUOTA_INVALID: projectId is required.");
    const { data, error } = await this.clientFactory().rpc("release_studio_quota_claim", {
      p_project_id: projectId,
    });
    if (error) throw new Error(`Studio quota release failed: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    if (!row) throw new Error("Studio quota claim is not readable after release.");
    return mapRow(row);
  }

  async releaseDuplicate(projectId: string, credits: number): Promise<StudioQuotaClaim> {
    if (!projectId.trim()) throw new Error("STUDIO_QUOTA_INVALID: projectId is required.");
    if (!Number.isFinite(credits) || credits < 0) throw new Error("STUDIO_QUOTA_INVALID: credits must be >= 0.");
    const { data, error } = await this.clientFactory().rpc("release_duplicate_studio_quota_claim", {
      p_project_id: projectId,
      p_credits: Math.floor(credits),
    });
    if (error) throw new Error(`Studio quota duplicate release failed: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    if (!row) throw new Error("Studio quota claim is not readable after duplicate release.");
    return mapRow(row);
  }
}

export interface MemoryQuotaPolicy {
  maxConcurrentJobs: number;
  dailyCredits: number;
  enforced: boolean;
}

/**
 * Explicit local/test adapter. Mirrors the SQL RPC guards field-for-field:
 * unconfigured project denies, disabled enforcement denies, concurrency and
 * daily-credit breaches deny with the same typed codes, release frees
 * concurrency only (spend stays consumed) and never drops below zero.
 * Single-process state only — never a production substitute.
 */
export class MemoryStudioQuotaService implements StudioQuotaPort {
  private readonly policies = new Map<string, MemoryQuotaPolicy>();
  private readonly claims = new Map<string, StudioQuotaClaim>();

  /** Seed (or replace) a project's policy. Projects without a policy deny. */
  setPolicy(projectId: string, policy: MemoryQuotaPolicy): void {
    this.policies.set(projectId, { ...policy });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private row(projectId: string): StudioQuotaClaim {
    const existing = this.claims.get(projectId);
    if (existing && existing.windowStart === this.today()) return existing;
    const fresh: StudioQuotaClaim = {
      projectId,
      windowStart: this.today(),
      concurrentCount: 0,
      creditsConsumed: 0,
    };
    this.claims.set(projectId, fresh);
    return fresh;
  }

  async claim(projectId: string, credits: number): Promise<StudioQuotaClaim> {
    if (!projectId.trim()) throw new Error("STUDIO_QUOTA_INVALID: projectId is required.");
    if (!Number.isFinite(credits) || credits < 0) throw new Error("STUDIO_QUOTA_INVALID: credits must be >= 0.");
    const policy = this.policies.get(projectId);
    if (!policy) throw new Error("STUDIO_QUOTA_UNCONFIGURED: no Studio quota policy for this project.");
    if (!policy.enforced) throw new Error("STUDIO_QUOTA_DISABLED: Studio quota enforcement is disabled for this project.");
    const row = this.row(projectId);
    const floored = Math.floor(credits);
    if (row.concurrentCount + 1 > policy.maxConcurrentJobs) {
      throw new Error("STUDIO_QUOTA_CONCURRENCY: too many concurrent Studio jobs for this project.");
    }
    if (row.creditsConsumed + floored > policy.dailyCredits) {
      throw new Error("STUDIO_QUOTA_EXCEEDED: daily Studio credit quota exceeded for this project.");
    }
    row.concurrentCount += 1;
    row.creditsConsumed += floored;
    return { ...row };
  }

  async release(projectId: string): Promise<StudioQuotaClaim> {
    if (!projectId.trim()) throw new Error("STUDIO_QUOTA_INVALID: projectId is required.");
    const row = this.row(projectId);
    row.concurrentCount = Math.max(0, row.concurrentCount - 1);
    return { ...row };
  }

  async releaseDuplicate(projectId: string, credits: number): Promise<StudioQuotaClaim> {
    if (!projectId.trim()) throw new Error("STUDIO_QUOTA_INVALID: projectId is required.");
    if (!Number.isFinite(credits) || credits < 0) throw new Error("STUDIO_QUOTA_INVALID: credits must be >= 0.");
    const row = this.row(projectId);
    row.concurrentCount = Math.max(0, row.concurrentCount - 1);
    row.creditsConsumed = Math.max(0, row.creditsConsumed - Math.floor(credits));
    return { ...row };
  }

  /** Test inspection only: current counters for a project. */
  peek(projectId: string): StudioQuotaClaim {
    return { ...this.row(projectId) };
  }
}

/**
 * Best-effort concurrency release for terminal paths. Quota accounting is
 * hygiene; execution/money truth is already committed when this runs, so a
 * release failure must never convert a settled outcome into a failure.
 * Returns false when the release did not happen. Never throws.
 */
export async function tryReleaseQuota(
  quota: StudioQuotaPort | undefined,
  projectId: string,
): Promise<boolean> {
  if (!quota) return false;
  try {
    await quota.release(projectId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort duplicate-claim rollback for admission retries and failed
 * reserves: the claim never became spend, so both the slot and the
 * advisory counter are restored. Never throws.
 */
export async function tryReleaseDuplicateQuota(
  quota: StudioQuotaPort | undefined,
  projectId: string,
  credits: number,
): Promise<boolean> {
  if (!quota) return false;
  try {
    await quota.releaseDuplicate(projectId, credits);
    return true;
  } catch {
    return false;
  }
}
