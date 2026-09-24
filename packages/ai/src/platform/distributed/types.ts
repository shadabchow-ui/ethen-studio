export type DistributedBackend = "memory" | "ioredis" | "upstash-rest";

export interface DistributedStore {
  readonly backend: DistributedBackend;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  del(key: string): Promise<number>;
  incr(key: string, ttlMs?: number): Promise<number>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  eval(script: string, keys: string[], args: Array<string | number>): Promise<unknown>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface RateLimitHit {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  count: number;
  backend: DistributedBackend | "unavailable";
  unavailable: boolean;
  reason: string | null;
}

export interface LockResult {
  acquired: boolean;
  token: string | null;
  expiresAt: number | null;
  backend: DistributedBackend | "unavailable";
  unavailable: boolean;
  reason: string | null;
}

export type IdempotencyStatus = "claimed" | "in_progress" | "replay";

export interface IdempotencyClaim {
  status: IdempotencyStatus;
  value: string | null;
  backend: DistributedBackend | "unavailable";
  unavailable: boolean;
  reason: string | null;
}

export interface ReplayDecision {
  accepted: boolean;
  backend: DistributedBackend | "unavailable";
  unavailable: boolean;
  reason: string | null;
}

export interface CounterResult {
  value: number;
  backend: DistributedBackend | "unavailable";
  unavailable: boolean;
  reason: string | null;
}
