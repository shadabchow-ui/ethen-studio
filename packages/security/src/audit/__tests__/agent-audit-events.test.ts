/**
 * REC-02B — Agent audit event contract tests.
 * Run: npx tsx lib/audit/__tests__/agent-audit-events.test.ts
 */

import {
  recordAuditEvent,
  resetAuditLog,
  getFilteredAuditLog,
  mapAuditEventToEntry,
} from "../service";
import { AUDIT_EVENT_LABELS, type AuditEventType } from "../types";

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

function main(): void {
  console.log("Agent audit event contracts\n");
  resetAuditLog();

  const agentEvents: AuditEventType[] = [
    "agent.launch",
    "agent.launch_denied",
    "agent.session_created",
  ];

  for (const eventType of agentEvents) {
    check(
      eventType in AUDIT_EVENT_LABELS,
      `${eventType} has a display label`,
    );
  }

  const launch = recordAuditEvent(
    "agent.launch",
    "system/agent-launch",
    "session-abc",
    {
      slug: "research-agent",
      sessionId: "session-abc",
      tenantId: "tenant-1",
      actorId: "tenant-1",
      target: { kind: "agent", id: "research-agent" },
      result: "session_created",
      summary: "Agent launch created session",
    },
  );

  check(launch.eventType === "agent.launch", "records agent.launch");
  check(launch.sessionId === "session-abc", "launch binds session id");
  check(launch.toolId === "system/agent-launch", "launch uses system/agent-launch tool id");
  check(
    typeof launch.metadata?.tenantId === "string",
    "launch metadata retains tenantId",
  );
  check(
    typeof launch.metadata?.actorId === "string",
    "launch metadata retains actorId",
  );
  check(
    launch.metadata?.result === "session_created",
    "launch does not claim execution — result is session_created",
  );

  const denied = recordAuditEvent(
    "agent.launch_denied",
    "system/agent-launch",
    null,
    {
      slug: "unknown-agent",
      reason: "unauthorized_or_unknown_agent_slug",
      result: "denied",
      target: { kind: "agent", id: "unknown-agent" },
    },
  );
  check(denied.eventType === "agent.launch_denied", "records agent.launch_denied");
  check(denied.sessionId === null, "denied launch has null session");

  const session = recordAuditEvent(
    "agent.session_created",
    "system/agent-launch",
    "session-xyz",
    {
      agentSlug: "research-agent",
      sessionId: "session-xyz",
      tenantId: "tenant-1",
      actorId: "tenant-1",
      target: { kind: "agent_session", id: "session-xyz" },
      result: "local_unpersisted",
      persisted: false,
    },
  );
  check(session.eventType === "agent.session_created", "records agent.session_created");

  const launches = getFilteredAuditLog({ eventType: "agent.launch" });
  check(launches.length === 1, "filter by agent.launch returns recorded event");

  const entry = mapAuditEventToEntry(launch);
  check(entry.label === "Agent Launch", "mapped entry has canonical label");
  check(entry.actor === "tenant-1", "mapped entry projects actorId as actor");
  check(
    entry.summary === "Agent launch created session",
    "mapped entry uses explicit summary",
  );
  check(entry.createdAt === launch.createdAt, "mapped entry preserves timestamp");

  // Missing optional fields stay null
  const sparse = recordAuditEvent("agent.launch_denied", "system/agent-launch", null, null);
  const sparseEntry = mapAuditEventToEntry(sparse);
  check(sparseEntry.actor === null, "missing actor remains null");
  check(
    sparseEntry.summary === "Agent Launch Denied",
    "missing summary falls back to label",
  );

  console.log(`\nChecks: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exitCode = 1;
}

main();
