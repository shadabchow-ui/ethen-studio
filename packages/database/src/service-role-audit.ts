import "server-only";

export interface ServiceRoleScope {
  reason: string;
  actorId?: string | null;
  tables?: readonly string[];
}

export interface ServiceRoleAuditEvent {
  at: string;
  reason: string;
  actorId: string | null;
  tables: readonly string[];
}

const AUDIT_KEY = "__ethenServiceRoleAudit";
const MAX_EVENTS = 200;

function getBuffer(): ServiceRoleAuditEvent[] {
  const scope = globalThis as typeof globalThis & {
    [AUDIT_KEY]?: ServiceRoleAuditEvent[];
  };
  if (!scope[AUDIT_KEY]) scope[AUDIT_KEY] = [];
  return scope[AUDIT_KEY]!;
}

export function recordServiceRoleAccess(scope: ServiceRoleScope): ServiceRoleAuditEvent {
  const event: ServiceRoleAuditEvent = {
    at: new Date().toISOString(),
    reason: scope.reason,
    actorId: scope.actorId ?? null,
    tables: scope.tables ?? [],
  };
  const buffer = getBuffer();
  buffer.push(event);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
  return event;
}

export function listServiceRoleAccess(): readonly ServiceRoleAuditEvent[] {
  return [...getBuffer()];
}

export function resetServiceRoleAccess(): void {
  getBuffer().length = 0;
}
