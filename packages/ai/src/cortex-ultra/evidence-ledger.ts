// ── Cortex Ultra Evidence Ledger ──────────────────────────────────────────────
// In-memory store for tool-derived evidence items within a single loop run.
// Evidence items are untrusted observations; callers treat them as grounding
// material, not as instructions.

import type { CortexEvidenceItem } from "./types";
import type { ToolClass } from "../cortex/types";

function generateId(): string {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// User-safe evidence summary for UI exposure.
export interface EvidenceLedgerSummary {
  total: number;
  groundedCount: number;
  deferredCount: number;
  toolClasses: ToolClass[];
  sourceUrls: string[];
  /** IDs usable as evidence index keys for verifier/synthesizer. */
  evidenceIds: string[];
  /** Human-readable description of evidence state. */
  description: string;
}

// Per-run ledger. Instantiate one per loop run; do not share across requests.
export class EvidenceLedger {
  private items: CortexEvidenceItem[] = [];
  private _deferredToolClasses = new Set<ToolClass>();
  private _sourceUrls: string[] = [];

  add(input: {
    requestId: string;
    toolName: string;
    toolClass: ToolClass;
    finding: string;
    sourceUrl?: string;
    confidence?: CortexEvidenceItem["confidence"];
  }): CortexEvidenceItem {
    const item: CortexEvidenceItem = {
      id: generateId(),
      requestId: input.requestId,
      toolName: input.toolName,
      toolClass: input.toolClass,
      finding: input.finding,
      sourceUrl: input.sourceUrl,
      confidence: input.confidence ?? "medium",
      createdAt: new Date().toISOString(),
    };
    this.items.push(item);
    if (input.sourceUrl && !this._sourceUrls.includes(input.sourceUrl)) {
      this._sourceUrls.push(input.sourceUrl);
    }
    return item;
  }

  /** Record a deferred (not-yet-wired) tool class for honest reporting. */
  markDeferred(toolClass: ToolClass): void {
    this._deferredToolClasses.add(toolClass);
  }

  /** Record source URLs collected during tool execution. */
  addSourceUrls(urls: string[]): void {
    for (const u of urls) {
      if (!this._sourceUrls.includes(u)) this._sourceUrls.push(u);
    }
  }

  all(): CortexEvidenceItem[] {
    return [...this.items];
  }

  count(): number {
    return this.items.length;
  }

  byTool(toolName: string): CortexEvidenceItem[] {
    return this.items.filter((e) => e.toolName === toolName);
  }

  /** Build an evidence index Record<string, CortexEvidenceItem> for verifier/synthesizer. */
  index(): Record<string, CortexEvidenceItem> {
    const idx: Record<string, CortexEvidenceItem> = {};
    for (const item of this.items) {
      idx[item.id] = item;
    }
    return idx;
  }

  /** User-safe summary for UI panels. Never exposes raw tool output. */
  summary(): EvidenceLedgerSummary {
    const toolClasses: ToolClass[] = [];
    const evidenceIds: string[] = [];

    for (const item of this.items) {
      evidenceIds.push(item.id);
      if (!toolClasses.includes(item.toolClass)) {
        toolClasses.push(item.toolClass);
      }
    }

    const groundedCount = this.items.filter(
      (e) => !this._deferredToolClasses.has(e.toolClass)
    ).length;
    const deferredCount = this.items.filter(
      (e) => this._deferredToolClasses.has(e.toolClass)
    ).length;

    let description: string;
    if (this.items.length === 0) {
      description = "No evidence collected for this run.";
    } else if (groundedCount === 0 && deferredCount > 0) {
      description = `${deferredCount} deferred evidence item(s). Read-only tools are allowed but execution wiring is not yet complete.`;
    } else if (deferredCount > 0) {
      description = `${groundedCount} grounded + ${deferredCount} deferred evidence item(s) from ${toolClasses.length} tool class(es).`;
    } else {
      description = `${groundedCount} grounded evidence item(s) from ${toolClasses.length} tool class(es).`;
    }

    return {
      total: this.items.length,
      groundedCount,
      deferredCount,
      toolClasses,
      sourceUrls: [...this._sourceUrls],
      evidenceIds,
      description,
    };
  }

  clear(): void {
    this.items = [];
    this._deferredToolClasses.clear();
    this._sourceUrls = [];
  }
}

// ── Module-level singleton for the tool-loop-runtime convenience API ──────────
// Callers that need isolation should instantiate EvidenceLedger directly.

const _ledger = new EvidenceLedger();

export function addEvidence(input: Parameters<EvidenceLedger["add"]>[0]): CortexEvidenceItem {
  return _ledger.add(input);
}

export function getAllEvidence(): CortexEvidenceItem[] {
  return _ledger.all();
}

export function clearEvidence(): void {
  _ledger.clear();
}
