import type { ClaimSourceLink } from "./source-integrity";
import type { EvidenceRow, ResearchSource } from "./types";

export type ReportClaimState = "verified" | "contested" | "not_assessed" | "unsupported";

export interface ReportCitation {
  claimId: string;
  sourceId: string;
  passage: string;
}

export interface ReportSection {
  id: string;
  heading: string;
  paragraphs: string[];
  citations: ReportCitation[];
  provenance: "synthesized" | "manual";
}

export interface ResearchReportDocument {
  schemaVersion: 1;
  sections: ReportSection[];
  bibliography: ResearchSource[];
  claimStates: Record<string, ReportClaimState>;
  lineage: { runId: string; policyVersion: string; provider: string; model: string | null };
}

export function validateReportPublication(document: ResearchReportDocument): string[] {
  const sourceIds = new Set(document.bibliography.map((source) => source.id));
  const errors: string[] = [];
  for (const section of document.sections) {
    for (const citation of section.citations) {
      if (!sourceIds.has(citation.sourceId)) errors.push(`Citation ${citation.claimId} has no ledger source.`);
      if (!citation.passage.trim()) errors.push(`Citation ${citation.claimId} has no supporting passage.`);
      if (document.claimStates[citation.claimId] !== "verified") {
        errors.push(`Citation ${citation.claimId} is not a verified claim.`);
      }
    }
  }
  return errors;
}

export function buildEvidenceGroundedReport(input: {
  runId: string;
  policyVersion: string;
  provider: string;
  model?: string | null;
  sources: ResearchSource[];
  claims: ClaimSourceLink[];
  evidence: EvidenceRow[];
}): ResearchReportDocument {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const citations = input.claims.map((claim) => ({
    claimId: claim.claimId,
    sourceId: claim.sourceId,
    passage: evidenceById.get(claim.claimId)?.snippet ?? evidenceById.get(claim.claimId)?.notes ?? "",
  }));
  return {
    schemaVersion: 1,
    sections: [{
      id: "findings",
      heading: "Findings",
      paragraphs: input.claims.map((claim) => claim.claim),
      citations,
      provenance: "synthesized",
    }],
    bibliography: input.sources.map((source) => ({ ...source })),
    claimStates: Object.fromEntries(input.claims.map((claim) => [claim.claimId, "verified" as const])),
    lineage: { runId: input.runId, policyVersion: input.policyVersion, provider: input.provider, model: input.model ?? null },
  };
}

/** Replaces exactly one section; all manually-authored sections remain byte-for-byte intact. */
export function regenerateReportSection(
  document: ResearchReportDocument,
  sectionId: string,
  replacement: Omit<ReportSection, "id">,
): ResearchReportDocument {
  if (!document.sections.some((section) => section.id === sectionId)) throw new Error("Report section was not found.");
  return { ...document, sections: document.sections.map((section) => section.id === sectionId ? { ...replacement, id: sectionId, provenance: "synthesized" } : section) };
}
