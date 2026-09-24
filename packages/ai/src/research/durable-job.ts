import type { ProofService } from "../platform/proof";
import type { UniversalRunService } from "../platform/runs";
import type { RunAccessScope, RunEnvelope, RunPolicySnapshot } from "../platform/runs";
import type { ResearchResult } from "./types";
import { validateResearchSourceIntegrity } from "./source-integrity";

export interface ResearchJobScope extends RunAccessScope {
  organizationId: string;
}

export interface EnqueueResearchJobInput {
  idempotencyKey: string;
  mode: "search" | "answer" | "contents";
  query: string;
  policySnapshot: RunPolicySnapshot;
}

export type ResearchJobStage = "retrieval" | "synthesis";

export interface ResearchReportExport {
  artifactId: string;
  filename: string;
  contentHash: string;
  bytes: Uint8Array;
}

export class ResearchJobCoordinator {
  constructor(
    private readonly runs: UniversalRunService,
    private readonly proof: ProofService,
  ) {}

  async enqueue(scope: ResearchJobScope, input: EnqueueResearchJobInput): Promise<RunEnvelope> {
    const run = await this.runs.createRun({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      actorId: scope.actorId,
      executionMode: "asynchronous",
      workspace: "research",
      idempotencyKey: input.idempotencyKey,
      policySnapshot: input.policySnapshot,
    });
    await this.runs.appendEvent(scope, run.id, {
      type: "research.planning",
      visibility: "internal",
      data: { mode: input.mode, query: input.query, policySnapshotHash: input.policySnapshot.hash },
    });
    return (await this.runs.getRun(scope, run.id))!;
  }

  async start(scope: ResearchJobScope, runId: string): Promise<RunEnvelope> {
    return this.runs.transition(scope, runId, "running");
  }

  async checkpoint(
    scope: ResearchJobScope,
    runId: string,
    stage: ResearchJobStage,
  ): Promise<RunEnvelope> {
    const run = await this.requireResearchRun(scope, runId);
    if (run.status !== "running") throw new Error("Only a running research job can checkpoint.");
    await this.runs.appendEvent(scope, runId, {
      type: "research.checkpoint",
      visibility: "internal",
      data: { researchStage: stage, checkpoint: true },
    });
    return (await this.runs.getRun(scope, runId))!;
  }

  async recoverAfterWorkerLoss(scope: ResearchJobScope, runId: string): Promise<RunEnvelope> {
    const run = await this.requireResearchRun(scope, runId);
    if (run.status !== "running") return run;
    const stage = [...run.events]
      .reverse()
      .find((event) => event.data.checkpoint === true)?.data.researchStage ?? "retrieval";
    await this.runs.transition(scope, runId, "paused");
    await this.runs.appendEvent(scope, runId, {
      type: "research.recovery",
      visibility: "internal",
      data: { code: "WORKER_LOST", retryable: true, researchStage: stage },
    });
    return this.runs.transition(scope, runId, "queued");
  }

  async cancel(scope: ResearchJobScope, runId: string): Promise<RunEnvelope> {
    const run = await this.requireResearchRun(scope, runId);
    if (run.status === "canceled") return run;
    const canceled = await this.runs.transition(scope, runId, "canceled");
    await this.runs.appendEvent(scope, runId, {
      type: "research.cancellation",
      visibility: "user",
      data: { reason: "requested_by_actor" },
    });
    return (await this.runs.getRun(scope, runId))!;
  }

  async complete(
    scope: ResearchJobScope,
    runId: string,
    result: ResearchResult,
  ): Promise<{ run: RunEnvelope; artifactId: string }> {
    const run = await this.requireResearchRun(scope, runId);
    if (run.status !== "running") throw new Error("Only a running research job can complete.");
    const integrity = validateResearchSourceIntegrity(result);
    if (!integrity.publishable) {
      throw new Error(`Research report is not publishable: ${integrity.errors.join(" ")}`);
    }
    const bytes = new TextEncoder().encode(JSON.stringify({
      schemaVersion: 1,
      runId,
      sourceLedger: integrity.sourceLedger,
      claimSourceMatrix: integrity.claimMatrix,
      result,
    }, null, 2));
    const artifact = await this.proof.createArtifact(scope, {
      organizationId: scope.organizationId,
      runId,
      name: "Research report",
      mediaType: "application/json",
      filename: `research-report-${runId}.json`,
      bytes,
      metadata: {
        workspace: "research",
        lifecycle: "private_beta",
        sourceCount: integrity.sourceLedger.length,
        claimCount: integrity.claimMatrix.length,
      },
    });
    await this.runs.appendEvent(scope, runId, {
      type: "artifact.linked",
      visibility: "user",
      data: { artifactId: artifact.id, contentHash: artifact.versions[0]?.contentHash },
    });
    return {
      run: await this.runs.transition(scope, runId, "succeeded"),
      artifactId: artifact.id,
    };
  }

  async exportReport(
    scope: ResearchJobScope,
    runId: string,
    artifactId: string,
    versionId?: string,
  ): Promise<ResearchReportExport> {
    const run = await this.requireResearchRun(scope, runId);
    const stored = await this.proof.readArtifactVersion(scope, artifactId, versionId);
    if (!stored) throw new Error("Research report artifact was not found.");
    if (stored.artifact.runId !== run.id) {
      throw new Error("Research report artifact does not belong to this run.");
    }
    const decoded = new TextDecoder().decode(stored.bytes);
    const report = JSON.parse(decoded) as {
      sourceLedger?: Array<{ id?: string; url?: string; retrievedAt?: string }>;
      claimSourceMatrix?: Array<{ sourceId?: string; sourceUrl?: string; retrievedAt?: string }>;
    };
    const ledger = new Map((report.sourceLedger ?? []).map((source) => [source.id, source]));
    if ((report.claimSourceMatrix ?? []).length === 0) {
      throw new Error("Research export has no claim-to-source matrix.");
    }
    for (const claim of report.claimSourceMatrix ?? []) {
      const source = ledger.get(claim.sourceId);
      if (
        !source ||
        source.url !== claim.sourceUrl ||
        source.retrievedAt !== claim.retrievedAt
      ) {
        throw new Error("Research export contains an unresolved claim-to-source link.");
      }
    }
    return {
      artifactId,
      filename: stored.version.filename,
      contentHash: stored.version.contentHash,
      bytes: stored.bytes,
    };
  }

  /** Create a new durable identity while preserving the original run lineage. */
  async replay(
    scope: ResearchJobScope,
    runId: string,
    idempotencyKey: string,
  ): Promise<RunEnvelope> {
    await this.requireResearchRun(scope, runId);
    const replay = await this.runs.continueRun(scope, runId, {
      idempotencyKey,
      reason: "research_replay",
      actorId: scope.actorId,
    });
    await this.runs.appendEvent(scope, replay.id, {
      type: "research.planning",
      visibility: "user",
      data: { replayOfRunId: runId },
    });
    return (await this.runs.getRun(scope, replay.id))!;
  }

  /** Fork a stored report only after proving its artifact belongs to the source run. */
  async fork(
    scope: ResearchJobScope,
    runId: string,
    artifactId: string,
    idempotencyKey: string,
  ): Promise<RunEnvelope> {
    await this.exportReport(scope, runId, artifactId);
    const fork = await this.runs.continueRun(scope, runId, {
      idempotencyKey,
      reason: "research_fork",
      actorId: scope.actorId,
    });
    await this.runs.appendEvent(scope, fork.id, {
      type: "artifact.linked",
      visibility: "user",
      data: { forkOfRunId: runId, forkOfArtifactId: artifactId },
    });
    return (await this.runs.getRun(scope, fork.id))!;
  }

  private async requireResearchRun(scope: ResearchJobScope, runId: string): Promise<RunEnvelope> {
    const run = await this.runs.getRun(scope, runId);
    if (!run || run.workspace !== "research") throw new Error("Research job was not found.");
    return run;
  }
}
