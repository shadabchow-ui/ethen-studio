/**
 * Studio V5 — the Pro workbench entry for simple-create frames.
 *
 * One text-labelled secondary link, rendered only where the tool has a
 * matching Pro destination (DEAD_OR_UNDEFINED_UI=NOT_ACCEPTABLE). Tools
 * without a matching destination (edit, 3d, transcribe, changer) render
 * nothing: there is no fallback. The active project rides the href.
 */

"use client";

import Link from "next/link";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

/** Create tool id -> matching Pro workbench route. Absent id means no Pro link. */
export const PRO_ROUTE: Record<string, string> = {
  image: "/studio/pro/image",
  video: "/studio/pro/video",
  voice: "/studio/pro/audio",
  music: "/studio/pro/audio",
  sfx: "/studio/pro/audio",
  dub: "/studio/pro/dubbing",
};

/** Matching Pro workbench route for a create tool id, or null when there is none. */
export function proRouteFor(toolId: string): string | null {
  return PRO_ROUTE[toolId] ?? null;
}

/** Modality word for the accessible name, derived from the destination route. */
export function proModalityFor(toolId: string): string | null {
  const route = proRouteFor(toolId);
  if (!route) return null;
  return route.split("/").pop() ?? toolId;
}

export function ProWorkbenchLink({ toolId, projectId }: { toolId: string; projectId: string | null }) {
  const route = proRouteFor(toolId);
  if (!route) return null;
  const modality = route.split("/").pop() ?? toolId;
  const label = `Open in Pro ${modality} workbench`;
  const href = projectId ? `${route}?projectId=${encodeURIComponent(projectId)}` : route;
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      data-testid="create-pro-link"
      className={`inline-flex min-h-[44px] shrink-0 items-center justify-center gap-[7px] rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-[11px] text-[12.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`}
    >
      <span className="hidden sm:inline">Open in Pro</span>
      <span className="sm:hidden">
        Pro <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
