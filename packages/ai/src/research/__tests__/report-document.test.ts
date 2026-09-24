import { describe, expect, it } from "vitest";
import { buildEvidenceGroundedReport, regenerateReportSection, validateReportPublication } from "../report-document";

const input = {
  runId: "run-1", policyVersion: "v1", provider: "exa",
  sources: [{ id: "source-1", title: "Source", url: "https://example.com", domain: "example.com", retrievedAt: "2026-08-01T00:00:00.000Z" }],
  claims: [{ claimId: "claim-1", claim: "Supported finding", sourceId: "source-1", sourceUrl: "https://example.com", retrievedAt: "2026-08-01T00:00:00.000Z" }],
  evidence: [{ id: "claim-1", finding: "Supported finding", sourceId: "source-1", snippet: "Exact supporting passage" }],
};

describe("evidence-grounded report document", () => {
  it("resolves every inline citation and fails closed when its evidence is missing", () => {
    const report = buildEvidenceGroundedReport(input);
    expect(validateReportPublication(report)).toEqual([]);
    report.sections[0]!.citations[0]!.passage = "";
    expect(validateReportPublication(report)).toContain("Citation claim-1 has no supporting passage.");
  });

  it("regenerates only the requested section and preserves manual edits", () => {
    const report = buildEvidenceGroundedReport(input);
    report.sections.push({ id: "notes", heading: "Notes", paragraphs: ["Manual text"], citations: [], provenance: "manual" });
    const next = regenerateReportSection(report, "findings", { heading: "Updated", paragraphs: ["Updated finding"], citations: [], provenance: "manual" });
    expect(next.sections.find((section) => section.id === "notes")).toEqual(report.sections.find((section) => section.id === "notes"));
  });
});
