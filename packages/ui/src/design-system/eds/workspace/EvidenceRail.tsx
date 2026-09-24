"use client";

/**
 * EDS EvidenceRail — D11 canonical (G7 remediation).
 *
 * One canonical third-dimension surface for INTENT · WORK · EVIDENCE. Six
 * sections in canonical order (Authority, Checks, Sources, Policy, Cost,
 * Receipt). A section whose complete row collection is EMPTY is OMITTED
 * entirely — never emitted as an ornamental `· 0` shell — and the surviving
 * sections keep their relative canonical order (EDS-050).
 *
 * Summary/provenance only: at most 4 visible rows per section — the complete
 * row collection (automatic canonical provenance rows plus caller lines) is
 * built first for a truthful total count, then only the visible summary is
 * sliced — no JSON blobs, no audit logs. Section counts are totals from the
 * complete collection, never caller-supplied.
 *
 * Detail opens in the Workspace via onOpenDetail — never a modal, never a
 * route. Each Detail control carries a section-distinct accessible name
 * ("View Authority detail") while the visible label stays restrained.
 *
 * Values are mono provenance (IBM Plex Mono through eds bindings), including
 * freshness/timestamps; checks are Ink + glyph + text, never green; failure
 * is Brick + glyph + text, never color alone. Cost is omitted unless a real
 * contract carries it.
 *
 * Inherits the containing EDS surface scope (theme + density). Do not add
 * data-eds here: a bare scope re-declares Dark values and traps the theme.
 */
import * as React from "react";
import type { EvidenceRecord } from "@ethen/contracts/platform/proof/contract";

export const EVIDENCE_SECTIONS = ["Authority", "Checks", "Sources", "Policy", "Cost", "Receipt"] as const;

export type EvidenceSection = (typeof EVIDENCE_SECTIONS)[number];

export type EvidenceCheckState = "pass" | "fail" | "pending";

export type EvidenceCheck = Readonly<{
  id: string;
  label: string;
  state: EvidenceCheckState;
  detail?: string;
}>;

export type EvidenceSource = Readonly<{
  id: string;
  label: string;
  identifier: string;
  freshness?: string;
}>;

export type EvidenceSectionData = Readonly<{
  lines: readonly React.ReactNode[];
  /**
   * @deprecated Counts are derived from the complete row collection. Any
   * supplied value is ignored so counts can never drift from content.
   */
  count?: number;
}>;

/**
 * Responsive presentation of the SAME rail. The host owns which presentation
 * is live at each breakpoint and reports it truthfully; this prop selects the
 * rail's own chrome for that presentation and is mirrored into the DOM so the
 * data model can never disagree with what the viewer actually sees:
 *
 * - `rail`    — persistent third column (404px >=1600, 320px 1280–1599)
 * - `overlay` — right-side panel over the Workspace (1024–1279)
 * - `sheet`   — bottom sheet (<1024)
 *
 * All three render the identical sections from the identical record — never a
 * product/device-specific rail.
 */
export type EvidencePresentation = "rail" | "overlay" | "sheet";

export interface EvidenceRailProps {
  record: EvidenceRecord;
  authority: EvidenceSectionData;
  checks: readonly EvidenceCheck[];
  sources: readonly EvidenceSource[];
  policy: EvidenceSectionData;
  cost?: EvidenceSectionData | null;
  receipt: EvidenceSectionData;
  onOpenDetail?: (section: EvidenceSection) => void;
  id?: string;
  presentation?: EvidencePresentation;
}

/**
 * Canonical summary-density contract: at most 4 VISIBLE rows per section.
 * Each section builds its complete row collection first (automatic provenance
 * rows lead so required real evidence is never sliced away by caller lines);
 * the total count derives from that collection and only the visible summary
 * is sliced.
 */
const EVIDENCE_SUMMARY_MAX_ROWS = 4;

type SummaryRows = ReadonlyArray<{ key: string; node: React.ReactNode }>;

function sliceSummary(rows: SummaryRows): SummaryRows {
  return rows.slice(0, EVIDENCE_SUMMARY_MAX_ROWS);
}

/**
 * EDS-050 section omission: a section with no real content is dropped from
 * the rail rather than rendered as an empty `· 0` shell. Order is preserved
 * because survivors are filtered out of the canonical tuple, never re-sorted.
 */
function omitEmptySections(
  built: ReadonlyMap<EvidenceSection, SummaryRows>,
): ReadonlyArray<{ section: EvidenceSection; rows: SummaryRows; count: number }> {
  const rendered: Array<{ section: EvidenceSection; rows: SummaryRows; count: number }> = [];
  for (const section of EVIDENCE_SECTIONS) {
    const all = built.get(section);
    if (!all || all.length === 0) continue;
    rendered.push({ section, rows: sliceSummary(all), count: all.length });
  }
  return rendered;
}

function SectionShell({
  section,
  rows,
  count,
  onOpenDetail,
}: {
  section: EvidenceSection;
  rows: SummaryRows;
  count: number;
  onOpenDetail?: (section: EvidenceSection) => void;
}) {
  return (
    <section aria-label={`${section} evidence`} className="eds-evidence__section" data-evidence-section={section}>
      <div className="eds-evidence__section-head">
        <h3 className="eds-evidence__section-title">
          {section} <span className="eds-evidence__count">· {count}</span>
        </h3>
        {onOpenDetail ? (
          <button
            type="button"
            className="eds-evidence__detail"
            aria-label={`View ${section} detail`}
            onClick={() => onOpenDetail(section)}
          >
            Detail
          </button>
        ) : null}
      </div>
      <div className="eds-evidence__lines">
        {rows.map((row) => (
          <p key={row.key} className="eds-evidence__line">{row.node}</p>
        ))}
      </div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="eds-evidence__mono">{children}</span>;
}

function CheckGlyph({ state }: { state: EvidenceCheckState }) {
  if (state === "pass") return <span aria-hidden className="eds-evidence__check-glyph eds-evidence__check-glyph--pass">✓</span>;
  if (state === "fail") return <span aria-hidden className="eds-evidence__check-glyph eds-evidence__check-glyph--fail">×</span>;
  return <span aria-hidden className="eds-evidence__check-glyph eds-evidence__check-glyph--pending">…</span>;
}

/**
 * Check state text. The label carries the human claim; this carries the
 * machine verdict. They must never be concatenated into "verified verified".
 */
const CHECK_STATE_TEXT: Record<EvidenceCheckState, string> = {
  pass: "verified",
  fail: "failed",
  pending: "pending",
};

export function EvidenceRail({
  record,
  authority,
  checks,
  sources,
  policy,
  cost = null,
  receipt,
  onOpenDetail,
  id = "eds-evidence-rail",
  presentation = "rail",
}: EvidenceRailProps) {
  // Automatic canonical provenance rows lead each section so required real
  // evidence is never sliced away; caller lines fill the remaining budget.
  // Each section builds its COMPLETE row collection first for a truthful
  // total count; only the visible summary is sliced to max 4.
  const allAuthorityRows = [
    { key: "provenance-actor", node: <>Actor <Mono>{record.actorId}</Mono></> },
    { key: "provenance-run", node: <>Run <Mono>{record.runId}</Mono> · attempt <Mono>{record.attemptId}</Mono></> },
    ...authority.lines.map((line, index) => ({ key: `caller-${index}`, node: line })),
  ];
  const allCheckRows = checks.map((check) => ({
    key: check.id,
    node: (
      <>
        <CheckGlyph state={check.state} />
        <span className="eds-evidence__check-label">
          {check.label}
          <span className="eds-evidence__check-state">{CHECK_STATE_TEXT[check.state]}</span>
        </span>
        {check.detail ? <Mono>{check.detail}</Mono> : null}
      </>
    ),
  }));
  const allSourceRows = sources.map((source) => ({
    key: source.id,
    node: (
      <>
        {source.label} <Mono>{source.identifier}</Mono>
        {source.freshness ? (
          <span className="eds-evidence__freshness">
            <Mono>{source.freshness}</Mono>
          </span>
        ) : null}
      </>
    ),
  }));
  const allPolicyRows = [
    { key: "provenance-policy", node: <>Policy <Mono>{record.policySnapshot.id}</Mono> · hash <Mono>{record.policyHash}</Mono></> },
    ...policy.lines.map((line, index) => ({ key: `caller-${index}`, node: line })),
  ];
  const allCostRows = cost
    ? cost.lines.map((line, index) => ({ key: `caller-${index}`, node: line }))
    : [];
  const allReceiptRows = [
    { key: "provenance-content", node: <>Content <Mono>{record.contentHash}</Mono></> },
    ...receipt.lines.map((line, index) => ({ key: `caller-${index}`, node: line })),
  ];
  // Canonical order is the tuple; omission filters, it never reorders.
  const built = new Map<EvidenceSection, SummaryRows>([
    ["Authority", allAuthorityRows],
    ["Checks", allCheckRows],
    ["Sources", allSourceRows],
    ["Policy", allPolicyRows],
    ["Cost", allCostRows],
    ["Receipt", allReceiptRows],
  ]);
  const rendered = omitEmptySections(built);
  return (
    <div
      id={id}
      role="complementary"
      aria-label="Evidence"
      className={`eds-evidence eds-evidence--${presentation}`}
      data-evidence-presentation={presentation}
    >
      {rendered.map((entry) => (
        <SectionShell
          key={entry.section}
          section={entry.section}
          rows={entry.rows}
          count={entry.count}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}
