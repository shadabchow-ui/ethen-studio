import type { VerifierType, VerifierStatus } from "./types";
import type { CortexResearchReceipt } from "./research";

export interface VerifierConstraints {
  requestedFormat?: string;
  expectedCitations?: string[];
  expectedFilePaths?: string[];
  expectedSourceMetadata?: boolean;
  expectedToolMetadata?: boolean;
  requestedToneOrStyle?: string;
}

export interface VerifierFinding {
  type: string;
  detail: string;
}

export interface VerifierInput {
  mode: string;
  intent: string;
  userRequest: string;
  outputText: string;
  constraints?: VerifierConstraints;
  researchReceipt?: Partial<CortexResearchReceipt>;
  routeReceiptTrace?: {
    verifierUsed?: boolean;
    verifierType?: string;
    score?: number;
    status?: string;
    warnings?: string[];
  };
  riskLevel?: "low" | "medium" | "high";
}

export interface VerifierOutput {
  status: VerifierStatus;
  score: number;
  verifierType: VerifierType;
  findings: VerifierFinding[];
  warnings: string[];
  suggestedFixes: string[];
  requiresRerun: boolean;
  summary: string;
}

const DETAILED_REQUEST_THRESHOLD = 80;
const SHORT_OUTPUT_THRESHOLD = 20;

function isDetailedRequest(text: string): boolean {
  const detailWords = ["explain", "detail", "analyze", "compare", "describe", "elaborate", "comprehensive", "thorough"];
  return text.length > DETAILED_REQUEST_THRESHOLD || detailWords.some((w) => text.toLowerCase().includes(w));
}

function hasFormatKeyword(text: string, format: string): boolean {
  const normalized = format.toLowerCase();
  const keywords = normalized.split(/[\s,/_\-]+/).filter(Boolean);
  if (keywords.length === 0) return true;
  return keywords.some((kw) => text.toLowerCase().includes(kw));
}

function getSummaryFromStatus(status: VerifierStatus, findings: VerifierFinding[]): string {
  if (status === "passed") return "Output verified successfully";
  if (status === "skipped") return "Verification skipped: insufficient metadata";
  if (findings.some((f) => f.type === "empty_output")) return "Empty output detected";
  if (findings.some((f) => f.type === "missing_citations")) return "Output needs review: missing citations";
  if (findings.some((f) => f.type === "missing_sources")) return "Output needs review: missing sources";
  if (findings.some((f) => f.type === "high_risk")) return "High-risk output requires manual review";
  if (findings.some((f) => f.type === "missing_file_paths")) return "Output needs review: missing file path evidence";
  if (findings.some((f) => f.type === "tone_style_unverifiable")) return "Output needs review: tone/style could not be verified";
  if (findings.some((f) => f.type === "unsupported_current_claim")) return "Output needs review: unsourced current/factual claim";
  if (findings.some((f) => f.type === "format_missing")) return "Output needs review: requested format may be missing";
  if (findings.some((f) => f.type === "output_too_short")) return "Output may be too short for the request";
  if (findings.length > 0) return "Output needs review";
  return "Verification completed with warnings";
}

const CURRENT_CLAIM_WORDS = ["currently", "as of today", "right now", "this year", "this week", "latest", "recently announced", "now offers", "today's"];

function hasUnsourcedCurrentClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return CURRENT_CLAIM_WORDS.some((w) => lower.includes(w));
}

export function verifyCortexOutput(input: VerifierInput): VerifierOutput {
  const { userRequest, outputText, constraints, researchReceipt, riskLevel, intent } = input;
  const findings: VerifierFinding[] = [];
  const warnings: string[] = [];
  const suggestedFixes: string[] = [];
  let score = 1;
  let needsRerun = false;
  let determinedType: VerifierType = "instruction_following";

  const hasEmptyOutput = !outputText || outputText.trim().length === 0;
  const isResearch = intent?.startsWith("research.");
  const isCode = intent?.startsWith("coding.");
  const isWriting = intent?.startsWith("writing.");

  const hasAnyConstraints =
    constraints &&
    (constraints.requestedFormat !== undefined ||
      constraints.expectedCitations !== undefined ||
      constraints.expectedFilePaths !== undefined ||
      constraints.expectedSourceMetadata !== undefined ||
      constraints.expectedToolMetadata !== undefined ||
      constraints.requestedToneOrStyle !== undefined);

  const isOptionalVerification = !hasAnyConstraints && !researchReceipt && !riskLevel && !isResearch && !isCode && !isWriting;

  if (isOptionalVerification) {
    return {
      status: "skipped",
      score: 0,
      verifierType: "instruction_following",
      findings: [{ type: "insufficient_metadata", detail: "Insufficient constraints or metadata for verification" }],
      warnings: [],
      suggestedFixes: [],
      requiresRerun: false,
      summary: "Verification skipped: insufficient metadata",
    };
  }

  if (hasEmptyOutput) {
    return {
      status: "failed",
      score: 0,
      verifierType: "instruction_following",
      findings: [{ type: "empty_output", detail: "Output text is empty" }],
      warnings: ["Empty output produced"],
      suggestedFixes: ["Re-run generation with proper context"],
      requiresRerun: true,
      summary: "Empty output detected",
    };
  }

  if (isResearch) {
    determinedType = "source";
  } else if (isCode) {
    determinedType = "code";
  } else if (isWriting) {
    determinedType = "writing";
  } else if (riskLevel === "high") {
    determinedType = "policy_risk";
  }

  if (isDetailedRequest(userRequest) && outputText.length < SHORT_OUTPUT_THRESHOLD) {
    findings.push({ type: "output_too_short", detail: "Output is shorter than expected given the request detail level" });
    warnings.push("Output may be too short for the requested detail level");
    score -= 0.15;
    suggestedFixes.push("Expand the output to cover the request in more detail");
  }

  if (constraints?.requestedFormat) {
    if (!hasFormatKeyword(outputText, constraints.requestedFormat)) {
      findings.push({ type: "format_missing", detail: `Requested format "${constraints.requestedFormat}" may be missing from output` });
      warnings.push(`Requested format "${constraints.requestedFormat}" not detected in output`);
      score -= 0.1;
      suggestedFixes.push(`Ensure the output follows the requested format: ${constraints.requestedFormat}`);
    }
  }

  if (isResearch) {
    if (researchReceipt) {
      if (researchReceipt.sourceGrounded && (researchReceipt.sourceCount ?? 0) > 0) {
        findings.push({ type: "source_grounded", detail: "Sources are present in research receipt" });
      } else if (researchReceipt.sourceGrounded === false || (researchReceipt.sourceCount ?? 0) === 0) {
        findings.push({ type: "missing_sources", detail: "Research intent requires sources but none provided" });
        warnings.push("Research output should be source-grounded but no sources were provided");
        score -= 0.25;
        suggestedFixes.push("Add sources to the research output");
      } else {
        findings.push({ type: "missing_sources", detail: "No source metadata available to verify source grounding" });
        warnings.push("Cannot confirm source grounding — source metadata not provided");
        score -= 0.15;
      }

      if (researchReceipt.citationsAvailable) {
        findings.push({ type: "citations_available", detail: "Citations are available in research receipt" });
      } else if (researchReceipt.citationsAvailable === false) {
        findings.push({ type: "missing_citations", detail: "Research intent requires citations but none available" });
        warnings.push("Citations expected but not found");
        score -= 0.25;
        suggestedFixes.push("Add citations to support factual claims");
      }

      if (researchReceipt.confidence === "unknown" || researchReceipt.confidence === "low") {
        findings.push({ type: "low_confidence", detail: `Research confidence is ${researchReceipt.confidence}` });
        warnings.push(`Research confidence is ${researchReceipt.confidence}`);
      }
    } else if (constraints?.expectedCitations && constraints.expectedCitations.length > 0) {
      findings.push({ type: "missing_citations", detail: "Expected citations defined but no research receipt provided" });
      warnings.push("Citations expected but no research receipt available");
      score -= 0.25;
      suggestedFixes.push("Provide research receipt with citation metadata");
    } else if (constraints?.expectedSourceMetadata) {
      findings.push({ type: "missing_sources", detail: "Source metadata expected but no research receipt provided" });
      warnings.push("Source metadata expected but no research receipt available");
      score -= 0.2;
      suggestedFixes.push("Provide research receipt with source metadata");
    }
  }

  if (isCode) {
    if (constraints?.expectedFilePaths && constraints.expectedFilePaths.length > 0) {
      const foundPaths = constraints.expectedFilePaths.filter((fp) => outputText.includes(fp));
      if (foundPaths.length === 0) {
        findings.push({ type: "missing_file_paths", detail: "Code route expected file path evidence but none found in output" });
        warnings.push("File path references expected but absent from output");
        score -= 0.15;
        suggestedFixes.push("Include relevant file paths in the output");
      } else {
        findings.push({ type: "file_paths_found", detail: `${foundPaths.length} expected file path(s) found in output` });
      }
    } else {
      findings.push({ type: "no_file_paths_expected", detail: "No file path constraints specified for code output verification" });
    }
  }

  if (isWriting) {
    if (constraints?.requestedToneOrStyle) {
      const tone = constraints.requestedToneOrStyle.toLowerCase();
      const formalWords = ["therefore", "however", "furthermore", "additionally", "consequently", "accordingly"];
      const casualWords = ["hey", "cool", "awesome", "btw", "just", "ok", "sure", "yeah", "nope"];
      const professionalWords = ["regarding", "proposal", "meeting", "deadline", "deliverable", "stakeholder"];

      let toneMatched = false;
      if (tone.includes("formal") || tone.includes("professional")) {
        toneMatched = formalWords.some((w) => outputText.toLowerCase().includes(w)) || professionalWords.some((w) => outputText.toLowerCase().includes(w));
      } else if (tone.includes("casual") || tone.includes("friendly") || tone.includes("conversational")) {
        toneMatched = casualWords.some((w) => outputText.toLowerCase().includes(w));
      }

      if (!toneMatched && outputText.length > 0) {
        findings.push({ type: "tone_style_unverifiable", detail: `Tone/style "${constraints.requestedToneOrStyle}" could not be verified from output text alone` });
        warnings.push(`Tone/style "${constraints.requestedToneOrStyle}" could not be verified deterministically from output text`);
        score -= 0.1;
        suggestedFixes.push("Review tone/style manually for best results");
      }
    }

    if (constraints?.requestedFormat) {
      if (!hasFormatKeyword(outputText, constraints.requestedFormat)) {
        findings.push({ type: "format_missing", detail: `Requested format "${constraints.requestedFormat}" not detected for writing output` });
        warnings.push(`Requested format "${constraints.requestedFormat}" not detected`);
        score -= 0.1;
        suggestedFixes.push(`Ensure the writing output follows the requested format: ${constraints.requestedFormat}`);
      }
    }

    if (!researchReceipt && hasUnsourcedCurrentClaim(outputText)) {
      findings.push({ type: "unsupported_current_claim", detail: "Output references current/recent facts but no research source was used" });
      warnings.push("Output makes a current-facts claim without a research source — verify before relying on it");
      score -= 0.15;
      suggestedFixes.push("Run a research pass or cite a source for current/factual claims");
    }
  }

  if (riskLevel === "high") {
    findings.push({ type: "high_risk", detail: "High-risk request detected — manual review recommended" });
    warnings.push("High-risk output requires careful review");
    score -= 0.25;
    suggestedFixes.push("Review output manually before use");
    needsRerun = true;

    if (determinedType === "instruction_following") {
      determinedType = "policy_risk";
    }
  }

  if (constraints?.expectedToolMetadata) {
    if (!researchReceipt && !input.routeReceiptTrace?.verifierUsed) {
      findings.push({ type: "tool_metadata_missing", detail: "Tool metadata expected but no route receipt or research receipt provided" });
      warnings.push("Expected tool metadata not available for verification");
      score -= 0.1;
    }
  }

  score = Math.max(0, Math.min(1, score));
  let status: VerifierStatus;
  if (score >= 0.8) {
    status = "passed";
  } else if (score >= 0.5) {
    status = "warned";
  } else {
    status = "failed";
  }

  const summary = getSummaryFromStatus(status, findings);

  return {
    status,
    score,
    verifierType: determinedType,
    findings,
    warnings,
    suggestedFixes,
    requiresRerun: needsRerun || (status === "failed" && !findings.some((f) => f.type === "high_risk" && riskLevel !== "high")),
    summary,
  };
}
