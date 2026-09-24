"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Studio V2 Job 13 — ephemeral workbench selection plumbing.
 *
 * Slot contracts are fixed (shared owns them), so cross-slot UI selection —
 * the currently previewed output, the inspected subject, a bound approval —
 * travels in this page-scoped context. It carries UI selection only, never
 * canonical state: every record here is a pointer/ locator that slots
 * re-resolve against canonical APIs. Clearing selection never mutates
 * product state.
 */

export interface StudioOutputLocator {
  assetId: string | null;
  jobId: string | null;
  title: string | null;
  kind: string | null;
  /** Canonical source URL (only present when the caller is source-authorized). */
  url: string | null;
  /** Short-lived preview URL. */
  previewUrl: string | null;
  expiresAt: string | null;
  contentHash: string | null;
  explicitDownload: boolean;
}

export interface StudioSelectedSubject {
  kind: "asset" | "job" | "review" | "project" | "node" | "shot" | "take" | "export" | "campaign-item";
  id: string;
  title: string;
  detail: Record<string, string>;
}

export interface StudioApprovalSelection {
  id: string;
  title: string;
  description: string;
  riskCategories: string[];
  action: string;
  resource: string;
  affectedEntities: string[];
  lifecycle: string;
  expiresAt: string | null;
  consumedAt: string | null;
  promptHash: string;
}

export interface StudioComposerConfig {
  appId: string;
  capability: string;
  disabledReason: string | null;
}

interface StudioWorkbenchSelection {
  output: StudioOutputLocator | null;
  setOutput: (output: StudioOutputLocator | null) => void;
  subject: StudioSelectedSubject | null;
  setSubject: (subject: StudioSelectedSubject | null) => void;
  approval: StudioApprovalSelection | null;
  setApproval: (approval: StudioApprovalSelection | null) => void;
  /** Route-provided composer context (which generator this page is). */
  composer: StudioComposerConfig | null;
  setComposer: (composer: StudioComposerConfig | null) => void;
  /** Latest generation/composer status line (quotes, denials, consent). */
  composerStatus: string | null;
  setComposerStatus: (status: string | null) => void;
  clearSelection: () => void;
}

const StudioWorkbenchSelectionContext = createContext<StudioWorkbenchSelection | null>(null);

export function StudioWorkbenchSelectionProvider({ children }: { children: ReactNode }) {
  const [output, setOutputState] = useState<StudioOutputLocator | null>(null);
  const [subject, setSubjectState] = useState<StudioSelectedSubject | null>(null);
  const [approval, setApprovalState] = useState<StudioApprovalSelection | null>(null);
  const [composer, setComposerState] = useState<StudioComposerConfig | null>(null);
  const [composerStatus, setComposerStatusState] = useState<string | null>(null);

  const setOutput = useCallback((next: StudioOutputLocator | null) => setOutputState(next), []);
  const setSubject = useCallback((next: StudioSelectedSubject | null) => setSubjectState(next), []);
  const setApproval = useCallback((next: StudioApprovalSelection | null) => setApprovalState(next), []);
  const setComposer = useCallback((next: StudioComposerConfig | null) => setComposerState(next), []);
  const setComposerStatus = useCallback((next: string | null) => setComposerStatusState(next), []);
  const clearSelection = useCallback(() => {
    setOutputState(null);
    setSubjectState(null);
    setApprovalState(null);
  }, []);

  const value = useMemo(
    () => ({ output, setOutput, subject, setSubject, approval, setApproval, composer, setComposer, composerStatus, setComposerStatus, clearSelection }),
    [output, setOutput, subject, setSubject, approval, setApproval, composer, setComposer, composerStatus, setComposerStatus, clearSelection],
  );
  return <StudioWorkbenchSelectionContext.Provider value={value}>{children}</StudioWorkbenchSelectionContext.Provider>;
}

export function useStudioWorkbenchSelection(): StudioWorkbenchSelection {
  const context = useContext(StudioWorkbenchSelectionContext);
  if (!context) {
    throw new Error("useStudioWorkbenchSelection must be used inside StudioWorkbenchSelectionProvider");
  }
  return context;
}

/** Null-safe read for slots that may render outside a workbench page. */
export function useStudioWorkbenchSelectionOptional(): StudioWorkbenchSelection | null {
  return useContext(StudioWorkbenchSelectionContext);
}
