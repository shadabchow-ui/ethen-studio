"use client";

/**
 * EDS ArtifactSurface — D10 candidate.
 *
 * One artifact surface/tab framework for the six canonical artifact kinds:
 * Document, Code, Slides, Table, Browser, Terminal. Kind-specific rendering
 * is a content contract (title, body, metadata); tab strip, version lineage,
 * diff affordance, and streaming-stable chrome live in WorkspacePattern.
 */
import * as React from "react";
import type { ArtifactRecord, ArtifactVersion } from "@ethen/contracts/platform/proof/contract";

export type ArtifactKind = "Document" | "Code" | "Slides" | "Table" | "Browser" | "Terminal";

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "Document",
  "Code",
  "Slides",
  "Table",
  "Browser",
  "Terminal",
];

export const MAX_VISIBLE_ARTIFACT_TABS = 5;

export interface ArtifactContent {
  kind: ArtifactKind;
  title: string;
  summary: string;
  body: React.ReactNode;
  meta: readonly string[];
}

export interface ArtifactTab {
  record: ArtifactRecord;
  versions: readonly ArtifactVersion[];
  content: ArtifactContent;
}

export function versionLabel(version: number): string {
  return `v${version}`;
}

export function ArtifactSurface({ tab }: { tab: ArtifactTab }) {
  const current = tab.versions.find((candidate) => candidate.id === tab.record.currentVersionId);
  return (
    <div className="eds-artifact" data-artifact-kind={tab.content.kind}>
      <div className="eds-artifact__body">{tab.content.body}</div>
      <p className="eds-artifact__summary">{tab.content.summary}</p>
      <dl className="eds-artifact__meta">
        {tab.content.meta.map((entry) => (
          <div key={entry} className="eds-artifact__meta-row">
            <dt className="eds-artifact__meta-term">Detail</dt>
            <dd className="eds-artifact__meta-value">{entry}</dd>
          </div>
        ))}
        <div className="eds-artifact__meta-row">
          <dt className="eds-artifact__meta-term">Version</dt>
          <dd className="eds-artifact__meta-value">{current ? versionLabel(current.version) : "v—"}</dd>
        </div>
      </dl>
    </div>
  );
}
