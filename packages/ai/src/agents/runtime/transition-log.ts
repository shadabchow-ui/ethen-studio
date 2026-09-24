import type {
  AgentRun,
  AgentRunStatus,
  RuntimeTransitionContext,
  RuntimeTransitionError,
  RuntimeTransitionLogEntry,
} from "./types";

const SENSITIVE_KEY_PATTERNS = [
  /secret/i,
  /token/i,
  /key/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
];

const transitionLogs = new Map<string, RuntimeTransitionLogEntry[]>();

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(value)) ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
      ? "[REDACTED]"
      : redactValue(value);
  }
  return output;
}

function sanitizeContext(context?: RuntimeTransitionContext | null): Record<string, unknown> | null {
  if (!context) return null;

  const payload: Record<string, unknown> = {};
  if (context.proposalId) payload.proposalId = context.proposalId;
  if (context.reason) payload.reason = context.reason;
  if (context.evidence) payload.evidence = context.evidence;
  if (context.metadata) payload.metadata = context.metadata;

  return Object.keys(payload).length > 0 ? redactObject(payload) : null;
}

export function appendTransitionLogEntry(input: {
  run: AgentRun;
  toStatus: AgentRunStatus;
  context?: RuntimeTransitionContext | null;
  occurredAt: string;
  error?: RuntimeTransitionError | null;
}): RuntimeTransitionLogEntry {
  const entry: RuntimeTransitionLogEntry = {
    runId: input.run.id,
    fromStatus: input.run.status,
    toStatus: input.toStatus,
    occurredAt: input.occurredAt,
    allowed: !input.error,
    reason: input.error?.message ?? null,
    context: sanitizeContext(input.context),
  };

  const existing = transitionLogs.get(input.run.id) ?? [];
  existing.push(entry);
  transitionLogs.set(input.run.id, existing);
  return entry;
}

export function getTransitionLog(runId: string): RuntimeTransitionLogEntry[] {
  return [...(transitionLogs.get(runId) ?? [])];
}

export function resetTransitionLogs(): void {
  transitionLogs.clear();
}
