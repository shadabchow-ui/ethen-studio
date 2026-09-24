/**
 * P03 — shared Studio setup state (RC-6).
 *
 * Rendered for HTTP 503 `SETUP_REQUIRED` only. Copy names the surface in
 * plain words and maps `details.dependency` to a dependency label — the
 * raw server string is never shown. There is intentionally no Retry:
 * retrying a missing service cannot succeed. The primary action links to
 * the nearest working surface; the secondary link opens the local runbook.
 */
"use client";

import Link from "next/link";
import { StudioEmptyState } from "./states";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";

const DEPENDENCY_LABELS: Readonly<Record<string, string>> = {
  supabase: "the Studio data service",
  "object-storage": "object storage",
  temporal: "the job orchestrator",
  worker: "the Studio worker",
  provider: "a realtime provider",
  catalog: "the model catalog",
  "signing-keys": "signing keys",
};

export function setupDependencyLabel(dependency: string | null | undefined): string {
  if (dependency && Object.prototype.hasOwnProperty.call(DEPENDENCY_LABELS, dependency)) {
    return DEPENDENCY_LABELS[dependency];
  }
  return "a required service";
}

export function StudioSetupState({
  what,
  dependency,
  primaryLabel,
  primaryHref,
  runbookHref = "/studio/setup",
  testId,
}: {
  /** Surface name in plain words, e.g. "Reviews". */
  what: string;
  /** Raw `details.dependency` value (mapped to a label, never shown). */
  dependency?: string | null;
  primaryLabel: string;
  primaryHref: string;
  runbookHref?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId ?? "studio-setup-state"}>
      <StudioEmptyState
        title={`${what} need ${setupDependencyLabel(dependency)}`}
        description={`${what} are unavailable here because ${setupDependencyLabel(dependency)} isn't connected. Nothing is broken — connect the service to continue.`}
        actionLabel={primaryLabel}
        actionHref={primaryHref}
      />
      <p className="mt-2 text-center text-[12.5px] text-[var(--text-secondary)]">
        <Link href={runbookHref} className={`inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`}>
          How to enable locally
        </Link>
      </p>
    </div>
  );
}
