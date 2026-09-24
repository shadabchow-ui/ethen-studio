import "server-only";
import { createClient } from "@ethen/database/server";
import { requireAuth, type GuardOutcome } from "../../../platform/auth/guards";
import { requireProject } from "../../../platform/auth/guards";
import { NextResponse } from "next/server";
import type { ComputerUseRun } from "./types";
import { computerUseLifecycleDenial } from "../../../platform/auth/product-surfaces";

/** Trusted session boundary for every computer-use handler. */
export async function requireComputerUseActor(): Promise<GuardOutcome> {
  return requireComputerUseActorWith(async () => {
    try { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); return user?.id ?? null; }
    catch { return null; }
  });
}

export async function requireComputerUseActorWith(resolveTrustedActor: () => Promise<string | null>): Promise<GuardOutcome> {
  const denied = computerUseLifecycleDenial();
  if (denied) {
    return { state: "forbidden", actorId: null, projectId: null, response: denied };
  }
  return requireAuth({ api: true, resolve: resolveTrustedActor });
}

export async function requireComputerUseRunActor(run: ComputerUseRun) {
  return requireComputerUseRunActorWith(run, () => requireComputerUseActor());
}

export async function requireComputerUseRunActorWith(
  run: ComputerUseRun,
  resolveActor: () => Promise<GuardOutcome>,
): Promise<GuardOutcome> {
  const guard = await resolveActor();
  if (guard.response) return guard;
  if (run.projectId) {
    const projectGuard = await requireProject({ api: true, projectId: run.projectId });
    if (projectGuard.response) return projectGuard;
    return projectGuard;
  }
  // Legacy records have no project tenancy key. Do not disclose their existence
  // to a different actor while they await migration.
  if (guard.actorId !== run.userId) return { ...guard, state: "forbidden" as const, response: NextResponse.json({ ok: false, error: "not_found", code: "not_found" }, { status: 404 }) };
  return guard;
}
