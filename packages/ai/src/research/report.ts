import type {
  ResearchResult,
  ResearchSource,
  EvidenceRow,
  SearchResult,
} from "./types";
import { buildSearchEvidence, buildSearchSources } from "./normalize";
import { validateOutput } from "../platform/output-validation";
import type { ValidationSchema } from "../platform/output-validation";
import { validateResearchSourceIntegrity } from "./source-integrity";

const RESEARCH_ARTIFACT_SCHEMA: ValidationSchema = {
  type: "object",
  required: ["content", "metadata"],
  properties: {
    content: { type: "string", minLength: 1 },
    metadata: {
      type: "object",
      required: ["source", "research_mode", "research_provider", "research_query"],
      properties: {
        source: { type: "string", minLength: 1 },
        research_mode: { type: "string", minLength: 1 },
        research_provider: { type: "string", minLength: 1 },
        research_query: { type: "string", minLength: 1 },
      },
    },
  },
};

export function getResearchSources(result: ResearchResult): ResearchSource[] {
  if (result.mode === "search") {
    return buildSearchSources(result.results);
  }
  return result.result.sources;
}

export function getResearchEvidence(result: ResearchResult): EvidenceRow[] {
  if (result.mode === "search") {
    return buildSearchEvidence(result.results);
  }
  return result.result.evidence;
}

export function buildResearchArtifactContent(
  result: ResearchResult,
  queryLabel: string,
  provider: "exa" | "mock",
): string {
  return buildValidatedResearchArtifactPayload(result, queryLabel, provider).content;
}

export function buildResearchArtifactMetadata(
  result: ResearchResult,
  queryLabel: string,
  provider: "exa" | "mock",
): Record<string, unknown> {
  return buildValidatedResearchArtifactPayload(result, queryLabel, provider).metadata;
}

function buildValidatedResearchArtifactPayload(
  result: ResearchResult,
  queryLabel: string,
  provider: "exa" | "mock",
): { content: string; metadata: Record<string, unknown> } {
  const sources = getResearchSources(result);
  const evidence = getResearchEvidence(result);
  const integrity = validateResearchSourceIntegrity(result);
  if (!integrity.publishable) {
    throw new Error(`Research report is not publishable: ${integrity.errors.join(" ")}`);
  }
  const lines: string[] = [
    "# Research Report",
    "",
    `- Mode: ${result.mode}`,
    `- Provider: ${provider}`,
    `- Query: ${queryLabel || "Not provided"}`,
    `- Source count: ${sources.length}`,
    `- Evidence rows: ${evidence.length}`,
    "",
  ];

  if (result.mode === "answer") {
    lines.push("## Answer", "", result.result.answer || "No answer text returned.", "");
  } else if (result.mode === "search") {
    lines.push("## Search Results", "");
    for (const item of result.results) {
      lines.push(`- ${formatSearchBullet(item)}`);
    }
    lines.push("");
  } else if (result.mode === "contents") {
    lines.push(
      "## Extracted Contents",
      "",
      `Title: ${result.result.title || "Untitled"}`,
      `URL: ${result.result.url || "Not returned"}`,
      `Characters: ${result.result.characterCount}`,
      "",
      result.result.text || "No extracted text returned.",
      "",
    );
  } else {
    lines.push("## Report", "", result.result.report || "No report text returned.", "");
  }

  lines.push("## Sources", "");
  if (sources.length === 0) {
    lines.push("No real source records were returned.");
  } else {
    for (const [index, source] of sources.entries()) {
      lines.push(
        `[${index + 1}] ${source.title || "Untitled source"} | ${source.url} | Retrieved ${source.retrievedAt} | ${source.domain || "No domain returned"}`,
      );
      if (source.snippet) {
        lines.push(`Snippet: ${source.snippet}`);
      }
    }
  }

  lines.push("", "## Evidence Table", "", "| Finding | Source | Status | Notes |", "| --- | --- | --- | --- |");
  if (evidence.length === 0) {
    lines.push("| No provider-backed evidence rows were returned. |  |  |  |");
  } else {
    for (const row of evidence) {
      lines.push(
        `| ${escapePipe(row.finding)} | ${escapePipe(formatEvidenceSource(row))} | ${escapePipe(row.status || "")} | ${escapePipe(row.notes || row.snippet || "")} |`,
      );
    }
  }

  const rawContent = lines.join("\n");
  const rawMetadata = {
    source: "research-workspace",
    research_mode: result.mode,
    research_provider: provider,
    research_query: limitText(queryLabel || "Not provided", 240),
    provenance_count: sources.length,
    evidence_count: evidence.length,
    sources: sources.slice(0, 20).map((source, index) => ({
      index: index + 1,
      title: source.title,
      url: source.url,
      domain: source.domain,
      publishedDate: source.publishedDate,
      retrievedAt: source.retrievedAt,
    })),
    evidence: evidence.slice(0, 50).map((row) => ({
      id: row.id,
      finding: limitText(row.finding, 200),
      sourceTitle: row.sourceTitle,
      sourceUrl: row.sourceUrl,
      status: row.status,
      notes: row.notes ? limitText(row.notes, 240) : undefined,
      snippet: row.snippet ? limitText(row.snippet, 240) : undefined,
    })),
    claim_source_matrix: integrity.claimMatrix,
    generated_at: new Date().toISOString(),
  };

  const validation = validateOutput(
    {
      content: rawContent,
      metadata: rawMetadata,
    },
    {
      schema: RESEARCH_ARTIFACT_SCHEMA,
      schemaName: "research-artifact-payload",
      maxStringLength: 12000,
      maxArrayLength: 50,
      requireGrounding: provider === "exa",
      citationCount: sources.length,
      executableContentMode: "warn",
    },
  );

  const sanitized = validation.sanitizedOutput as {
    content: string;
    metadata: Record<string, unknown>;
  };

  return {
    content: sanitized.content,
    metadata: {
      ...sanitized.metadata,
      output_validation: {
        ok: validation.ok,
        severity: validation.severity,
        warnings: validation.warnings.map((warning) => ({
          code: warning.code,
          stage: warning.stage,
          path: warning.path,
        })),
        errors: validation.errors.map((error) => ({
          code: error.code,
          stage: error.stage,
          path: error.path,
        })),
        redactions: validation.redactions,
        evidence: validation.evidence,
      },
    },
  };
}

export function getResearchToolId(mode: ResearchResult["mode"]): string {
  switch (mode) {
    case "search":
      return "research.search";
    case "answer":
      return "research.answer";
    case "contents":
      return "research.contents";
    case "agent":
      return "research.agent";
  }
}

function formatSearchBullet(result: SearchResult): string {
  const url = result.url || "No URL returned";
  const title = result.title || url;
  const snippet = result.snippet ? ` — ${result.snippet}` : "";
  return `${title} (${url})${snippet}`;
}

function formatEvidenceSource(row: EvidenceRow): string {
  if (row.sourceTitle && row.sourceUrl) {
    return `${row.sourceTitle} (${row.sourceUrl})`;
  }
  if (row.sourceTitle) return row.sourceTitle;
  if (row.sourceUrl) return row.sourceUrl;
  if (row.sourceDomain) return row.sourceDomain;
  return "";
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function limitText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export interface ResearchBriefSummary {
  mode: string;
  provider: string;
  sourceCount: number;
  resultPreview: string;
}

export function buildResearchBriefSummary(
  result: ResearchResult,
  query: string,
  provider: string,
): ResearchBriefSummary {
  const sources = getResearchSources(result);
  let previewText = "";

  if (result.mode === "search") {
    previewText = result.results[0]?.snippet ?? "";
  } else if (result.mode === "contents") {
    previewText = result.result.text ?? "";
  } else if (result.mode === "answer") {
    previewText = result.result.answer ?? "";
  } else {
    previewText = result.result.report ?? "";
  }

  const preview = limitText(previewText, 300);

  return {
    mode: result.mode,
    provider,
    sourceCount: sources.length,
    resultPreview: preview || `No result text for query "${query}"`,
  };
}
