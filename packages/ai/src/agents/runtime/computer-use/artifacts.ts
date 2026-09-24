import type { ComputerUseArtifact } from "./types";
import {
  getComputerUseArtifacts,
  addComputerUseArtifact,
  getComputerUseRun,
} from "./store-adapter";

export interface ArtifactSummary {
  runId: string;
  totalArtifacts: number;
  byType: Record<string, number>;
  artifacts: ComputerUseArtifact[];
}

export function createArtifact(
  runId: string,
  artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string },
): ComputerUseArtifact | null {
  const run = getComputerUseRun(runId);
  if (!run) return null;
  return addComputerUseArtifact(runId, artifact);
}

export function getArtifacts(runId: string): ComputerUseArtifact[] {
  return getComputerUseArtifacts(runId);
}

export function getArtifactSummary(runId: string): ArtifactSummary {
  const artifacts = getComputerUseArtifacts(runId);
  const byType: Record<string, number> = {};
  for (const a of artifacts) {
    byType[a.type] = (byType[a.type] || 0) + 1;
  }
  return {
    runId,
    totalArtifacts: artifacts.length,
    byType,
    artifacts,
  };
}

export function getArtifactsByType(runId: string, type: ComputerUseArtifact["type"]): ComputerUseArtifact[] {
  return getComputerUseArtifacts(runId).filter((a) => a.type === type);
}

export function generateArtifactManifest(runId: string): Record<string, unknown> {
  const summary = getArtifactSummary(runId);
  const run = getComputerUseRun(runId);
  return {
    runId,
    runTitle: run?.title ?? null,
    runStatus: run?.status ?? null,
    generatedAt: new Date().toISOString(),
    totalArtifacts: summary.totalArtifacts,
    byType: summary.byType,
    artifacts: summary.artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      uri: a.uri,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      redacted: a.redacted,
      createdAt: a.createdAt,
    })),
  };
}

export function generateArtifactMarkdown(runId: string): string {
  const summary = getArtifactSummary(runId);
  const run = getComputerUseRun(runId);
  const lines: string[] = [];

  lines.push(`# Artifacts`);
  lines.push(``);
  lines.push(`**Run:** ${run?.title ?? runId}`);
  lines.push(`**Status:** ${run?.status ?? "unknown"}`);
  lines.push(`**Total Artifacts:** ${summary.totalArtifacts}`);
  lines.push(``);

  if (summary.totalArtifacts === 0) {
    lines.push(`No artifacts produced for this run.`);
    lines.push(``);
    return lines.join("\n");
  }

  lines.push(`## By Type`);
  lines.push(``);
  for (const [type, count] of Object.entries(summary.byType)) {
    lines.push(`- **${type}:** ${count}`);
  }
  lines.push(``);

  lines.push(`## All Artifacts`);
  lines.push(``);
  for (const a of summary.artifacts) {
    lines.push(`### ${a.title}`);
    lines.push(``);
    lines.push(`- **Type:** ${a.type}`);
    lines.push(`- **Content Type:** ${a.contentType}`);
    lines.push(`- **Size:** ${a.sizeBytes} bytes`);
    lines.push(`- **URI:** ${a.uri}`);
    lines.push(`- **Redacted:** ${a.redacted ? "yes" : "no"}`);
    lines.push(`- **Created:** ${a.createdAt}`);
    lines.push(``);
  }

  return lines.join("\n");
}
