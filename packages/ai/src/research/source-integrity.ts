import type { EvidenceRow, ResearchResult, ResearchSource } from "./types";
import { buildSearchEvidence, buildSearchSources } from "./normalize";
import { buildSourceLedger, validateSourceLedger } from "./source-ledger";

function sourcesFor(result: ResearchResult): ResearchSource[] {
  return result.mode === "search" ? buildSearchSources(result.results) : result.result.sources;
}

function evidenceFor(result: ResearchResult): EvidenceRow[] {
  return result.mode === "search" ? buildSearchEvidence(result.results) : result.result.evidence;
}

export interface ClaimSourceLink {
  claimId: string;
  claim: string;
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
}

export interface SourceIntegrityResult {
  publishable: boolean;
  sourceLedger: ResearchSource[];
  claimMatrix: ClaimSourceLink[];
  errors: string[];
}

export function validateResearchSourceIntegrity(result: ResearchResult): SourceIntegrityResult {
  const sourceLedger = sourcesFor(result);
  const evidence = evidenceFor(result);
  const sources = new Map(sourceLedger.map((source) => [source.id, source]));
  const errors: string[] = [];

  for (const source of sourceLedger) {
    if (!source.url.trim()) errors.push(`Source ${source.id} has no URL.`);
    if (!source.retrievedAt?.trim() || Number.isNaN(Date.parse(source.retrievedAt))) {
      errors.push(`Source ${source.id} has no valid retrieval date.`);
    }
  }

  const claimMatrix = evidence.flatMap((claim: EvidenceRow): ClaimSourceLink[] => {
    if (!claim.sourceId) {
      errors.push(`Claim ${claim.id} has no source link.`);
      return [];
    }
    const source = sources.get(claim.sourceId);
    if (!source) {
      errors.push(`Claim ${claim.id} links an unretrieved source.`);
      return [];
    }
    return [{
      claimId: claim.id,
      claim: claim.finding,
      sourceId: source.id,
      sourceUrl: source.url,
      retrievedAt: source.retrievedAt!,
    }];
  });

  if (evidence.length === 0) errors.push("A publishable report requires at least one sourced claim.");
  const ledgerErrors = validateSourceLedger(buildSourceLedger(sourceLedger.map((source) => ({
    ...source,
    provider: "exa",
    query: "integrity validation",
  }))));
  errors.push(...ledgerErrors);
  return { publishable: errors.length === 0, sourceLedger, claimMatrix, errors };
}
