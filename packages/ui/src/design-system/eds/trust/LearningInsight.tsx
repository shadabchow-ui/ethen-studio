"use client";

/**
 * EDS LearningInsight — D12 signature component.
 *
 * Narrative first. The insight is a sentence a person can read and disagree
 * with, not a metric they have to interpret. Evidence count and confidence
 * follow in the provenance register (mono), so the reader can see how much
 * the claim rests on. A chart, if there is one at all, comes last and is
 * secondary — a chart placed first turns a claim into a dashboard and quietly
 * transfers the burden of interpretation back to the reader.
 *
 * Confidence is a word plus a count, never a bare percentage and never a
 * colour: "moderate · 14 observations" says more than an amber dot, and it
 * survives forced-colors.
 *
 * Honesty: learning history is not a backend capability today. A caller with
 * no real observations must say so through `dependency` rather than render a
 * confident-looking insight over invented history.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";
import { DependencyNote } from "./Dependency";

export type InsightConfidence = "low" | "moderate" | "high";

export const INSIGHT_CONFIDENCE_TEXT: Record<InsightConfidence, string> = {
  low: "low",
  moderate: "moderate",
  high: "high",
};

export interface LearningInsightProps {
  /** The claim, in plain language. This is the component's subject. */
  narrative: string;
  /** How many real observations back the claim. */
  observations?: number;
  confidence?: InsightConfidence;
  /** Where the observations came from. */
  basis?: string;
  /** Secondary, optional, and never the lead. */
  chart?: React.ReactNode;
  /** Set when no real learning history exists for this insight. */
  dependency?: { label: string; dependsOn: string; note?: string };
  id?: string;
}

export function LearningInsight({
  narrative,
  observations,
  confidence,
  basis,
  chart,
  dependency,
  id,
}: LearningInsightProps) {
  const reactId = React.useId();
  const insightId = id ?? `eds-insight-${reactId}`;
  const hasEvidence = typeof observations === "number" && observations > 0 && !!confidence;

  return (
    <section id={insightId} className="eds-insight" aria-labelledby={`${insightId}-narrative`}>
      <p id={`${insightId}-narrative`} className="eds-insight__narrative">{narrative}</p>

      {hasEvidence ? (
        <p className="eds-insight__evidence">
          <span className="eds-insight__mono">{observations}</span> observations · confidence{" "}
          <span className="eds-insight__mono">{INSIGHT_CONFIDENCE_TEXT[confidence]}</span>
          {basis ? <span className="eds-insight__basis"> · {basis}</span> : null}
        </p>
      ) : null}

      {dependency ? (
        <DependencyNote label={dependency.label} dependsOn={dependency.dependsOn} note={dependency.note} />
      ) : null}

      {chart ? <div className="eds-insight__chart">{chart}</div> : null}
    </section>
  );
}
