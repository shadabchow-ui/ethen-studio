/**
 * STUDIO_20 — cutover redirect table.
 *
 * Same-path routes need no rewrite (DNS cutover serves them from the
 * standalone app). This table covers renamed/retired paths only, plus
 * an explicit STAY list: live product URLs that must NOT redirect
 * (Voice product surface, Chat voice) until parity is proven and the
 * owning domain hands off the cutover.
 */

export interface CutoverRedirect {
  from: string;
  to: string;
  /** Temporary preserves exact `redirect()` behavior; never 308 without proof. */
  status: 307;
  reason: string;
}

/**
 * Mirrors the standalone page-level `redirect()` stubs. M5 removed the
 * stale landing/models rows: standalone serves the canonical V5 home
 * at `/studio` and the models adapter at `/studio/models` (same URL,
 * no redirect). The monolith legacy stubs still redirect; they are
 * monolith-only and not cutover behavior.
 */
export const CUTOVER_REDIRECTS: readonly CutoverRedirect[] = [
  { from: "/studio/image", to: "/studio/create/image", status: 307, reason: "V5 M1 canonical Image create tool (one hop, query preserved)" },
  { from: "/studio/video", to: "/studio/create/video", status: 307, reason: "V5 M1 canonical Video create tool (one hop, query preserved)" },
  { from: "/studio/audio", to: "/studio/create/voice", status: 307, reason: "V5 M1 canonical audio entry (Voice create tool)" },
  { from: "/studio/canvas", to: "/studio/workflows", status: 307, reason: "V5 M1 canonical Canvas index (no redirect home)" },
] as const;

export interface CutoverStay {
  path: string;
  reason: string;
}

/**
 * Live surfaces that stay. Voice product URLs redirect only after
 * parity proof + Voice owner handoff; Chat voice is never in scope.
 */
export const CUTOVER_STAYS: readonly CutoverStay[] = [
  { path: "/voice/studio", reason: "live Voice product page; V5 audio parity unproven, no owner handoff" },
  { path: "/voice/*", reason: "Voice product surface; redirects need Voice owner handoff" },
  { path: "/chat/voice", reason: "Chat voice explicitly out of Studio scope" },
  { path: "/api/media/*", reason: "retained authenticated adapters; monolith clients exist" },
] as const;

export function resolveCutoverRedirect(path: string): CutoverRedirect | null {
  const match = CUTOVER_REDIRECTS.find((r) => r.from === path) ?? null;
  return match ? { ...match } : null;
}

export function isCutoverStay(path: string): boolean {
  return CUTOVER_STAYS.some((s) =>
    s.path.endsWith("/*") ? path.startsWith(s.path.slice(0, -1)) : path === s.path,
  );
}
