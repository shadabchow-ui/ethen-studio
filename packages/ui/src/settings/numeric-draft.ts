/**
 * RC10 — shared numeric-draft commit rule for settings fields.
 *
 * CSS-free so node:test suites can import it directly (settings-shell.tsx
 * pulls in a CSS module, which tsx cannot load). Intermediate keystrokes
 * are never parsed — the draft is parsed, optionally rounded, and clamped
 * only on commit — so decimal values like `7.5` stay typeable.
 */

export interface NumericCommitOpts {
  min: number;
  max: number;
  /** Round to the nearest integer before clamping. */
  integer?: boolean;
  /** Last committed value; unparseable/empty drafts revert to it. */
  fallback: number;
}

/**
 * Parse a numeric draft on commit. Empty, whitespace-only, and
 * non-finite drafts revert to `fallback` instead of writing NaN.
 */
export function commitNumericDraft(draft: string, opts: NumericCommitOpts): number {
  const trimmed = draft.trim();
  if (trimmed === "") return opts.fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return opts.fallback;
  const rounded = opts.integer ? Math.round(parsed) : parsed;
  return Math.min(opts.max, Math.max(opts.min, rounded));
}
