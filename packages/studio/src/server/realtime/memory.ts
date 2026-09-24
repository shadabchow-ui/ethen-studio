/** Studio V5 realtime — in-memory store for tests and local flows (STUDIO_16). */
import "server-only";
import type { RealtimeRepository } from "./sessions";
import type { RealtimeToolRepository } from "./tools";
import {
  realtimeError,
  type RealtimeEpochRecord,
  type RealtimeIntervalRecord,
  type RealtimeSessionEvent,
  type RealtimeSessionRecord,
  type RealtimeToolCall,
  type RealtimeTransportCredential,
} from "./types";

export class MemoryRealtimeStore implements RealtimeRepository, RealtimeToolRepository {
  private readonly sessions = new Map<string, RealtimeSessionRecord>();
  private readonly epochs = new Map<string, RealtimeEpochRecord>();
  private readonly intervals = new Map<string, RealtimeIntervalRecord>();
  private readonly events: RealtimeSessionEvent[] = [];
  private readonly credentials: RealtimeTransportCredential[] = [];
  private readonly toolCalls = new Map<string, RealtimeToolCall>();

  private assertScope(record: RealtimeSessionRecord, projectId: string, what: string): void {
    if ((record.scope.projectId as string) !== projectId) {
      throw realtimeError("FORBIDDEN", `${what} is outside the current project scope.`);
    }
  }

  async insertSession(session: RealtimeSessionRecord): Promise<void> {
    if (this.sessions.has(session.sessionId)) {
      throw realtimeError("CONFLICT", `Session ${session.sessionId} already exists.`);
    }
    this.sessions.set(session.sessionId, { ...session });
  }

  async getSession(sessionId: string): Promise<RealtimeSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  getSessionInProject(sessionId: string, projectId: string): RealtimeSessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) throw realtimeError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
    this.assertScope(session, projectId, "Session");
    return session;
  }

  listSessionsByProject(projectId: string): RealtimeSessionRecord[] {
    return [...this.sessions.values()]
      .filter((s) => (s.scope.projectId as string) === projectId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async updateSession(session: RealtimeSessionRecord): Promise<void> {
    if (!this.sessions.has(session.sessionId)) {
      throw realtimeError("NOT_FOUND", `Realtime session ${session.sessionId} was not found.`);
    }
    this.sessions.set(session.sessionId, { ...session });
  }

  async countActiveByProject(projectId: string): Promise<number> {
    return [...this.sessions.values()].filter(
      (s) => (s.scope.projectId as string) === projectId && s.status !== "ENDED" && s.status !== "REVOKED" && s.status !== "ERRORED",
    ).length;
  }

  async insertEpoch(epoch: RealtimeEpochRecord): Promise<void> {
    const key = `${epoch.sessionId}:e${epoch.epoch}`;
    if (this.epochs.has(key)) throw realtimeError("CONFLICT", `Epoch ${epoch.epoch} already exists for session ${epoch.sessionId}.`);
    this.epochs.set(key, { ...epoch });
  }

  async insertInterval(interval: RealtimeIntervalRecord): Promise<void> {
    if (this.intervals.has(interval.intervalId)) {
      throw realtimeError("CONFLICT", `Interval ${interval.intervalId} already exists.`);
    }
    this.intervals.set(interval.intervalId, { ...interval });
  }

  async closeInterval(intervalId: string, endedAt: string): Promise<RealtimeIntervalRecord> {
    const interval = this.intervals.get(intervalId);
    if (!interval) throw realtimeError("NOT_FOUND", `Interval ${intervalId} was not found.`);
    if (interval.endedAt) return interval;
    const closed = { ...interval, endedAt };
    this.intervals.set(intervalId, closed);
    return closed;
  }

  async listIntervals(sessionId: string): Promise<RealtimeIntervalRecord[]> {
    return [...this.intervals.values()]
      .filter((i) => i.sessionId === sessionId)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  }

  async openInterval(sessionId: string): Promise<RealtimeIntervalRecord | null> {
    return (
      [...this.intervals.values()]
        .filter((i) => i.sessionId === sessionId && !i.endedAt)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null
    );
  }

  async insertEvent(event: RealtimeSessionEvent): Promise<void> {
    this.events.push({ ...event });
  }

  async findEventByProviderId(sessionId: string, providerEventId: string): Promise<RealtimeSessionEvent | null> {
    return this.events.find((e) => e.sessionId === sessionId && e.providerEventId === providerEventId) ?? null;
  }

  async nextSequence(sessionId: string): Promise<number> {
    return this.events.filter((e) => e.sessionId === sessionId).length + 1;
  }

  async listEvents(sessionId: string): Promise<RealtimeSessionEvent[]> {
    return this.events.filter((e) => e.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence);
  }

  async insertCredential(credential: RealtimeTransportCredential): Promise<void> {
    this.credentials.push({ ...credential });
  }

  async activeCredential(sessionId: string, epoch: number): Promise<RealtimeTransportCredential | null> {
    return (
      this.credentials
        .filter((c) => c.sessionId === sessionId && c.epoch === epoch && !c.revoked)
        .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))[0] ?? null
    );
  }

  async revokeCredentials(sessionId: string): Promise<void> {
    for (const credential of this.credentials) {
      if (credential.sessionId === sessionId) credential.revoked = true;
    }
  }

  async insertToolCall(call: RealtimeToolCall): Promise<void> {
    if (this.toolCalls.has(call.callId)) throw realtimeError("CONFLICT", `Tool call ${call.callId} already exists.`);
    this.toolCalls.set(call.callId, { ...call });
  }

  async getToolCall(callId: string): Promise<RealtimeToolCall | null> {
    return this.toolCalls.get(callId) ?? null;
  }

  async updateToolCall(call: RealtimeToolCall): Promise<void> {
    if (!this.toolCalls.has(call.callId)) throw realtimeError("NOT_FOUND", `Tool call ${call.callId} was not found.`);
    this.toolCalls.set(call.callId, { ...call });
  }

  async listToolCalls(sessionId: string): Promise<RealtimeToolCall[]> {
    return [...this.toolCalls.values()]
      .filter((c) => c.sessionId === sessionId)
      .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1));
  }

  async listPendingApprovals(sessionId: string): Promise<RealtimeToolCall[]> {
    return (await this.listToolCalls(sessionId)).filter((c) => c.status === "awaiting_approval");
  }
}

export function createMemoryRealtimeStore(): MemoryRealtimeStore {
  return new MemoryRealtimeStore();
}
