import type { ReactNode } from "react";
import {
  getStudioNavEntries,
  getStudioPaletteEntries,
} from "@ethen/navigation";
import { StudioWorkbenchChrome } from "@/components/studio/StudioWorkbenchChrome";
import { StudioWorkbenchBoot } from "@/components/studio/slots/StudioWorkbenchBoot";
import { StudioWorkbenchSelectionProvider } from "@/components/studio/slots/selection-context";
import { StudioActiveProjectProvider } from "@/components/studio/studio-project-scope";
import { readActiveProjectCookie } from "@/lib/studio-v5/active-project-server";

/**
 * Studio V3 Job 1 — authenticated workbench layout (shared Chat chrome).
 *
 * SharedChatChrome (the actual Chat rail/resize/topbar/drawer frame) + slot
 * boot + workbench selection. Each workbench page composes its own
 * `StudioShell(dataSource="live")` interior — full generator workbench or
 * children passthrough — so the canonical stack has exactly one StudioShell
 * per page in the right mode. No AppShell/ConsoleShell ownership remains.
 * Scopes (V2ProductionScope + EdsScope) come from the studio segment layout.
 *
 * Navigation and palette entries derive from the canonical portfolio
 * registry via the Job 12 lifecycle derivation — never hardcoded. The
 * enrolled-scope derivation renders here because this layout exists only
 * inside the Studio app boundary, where session + project-membership
 * guards at routes/APIs are the access authority. Unenrolled audiences
 * see no Studio workspace entries on shared surfaces: the shared
 * sections carry zero Studio hrefs and the shared palette carries only
 * the single flagship boundary entry (proven by derivation tests + the
 * Job 13 no-leak test), and the registry keeps Studio hidden from
 * public discovery.
 */

/**
 * IE-M6B M6B-07 — route focus (M5-01), destination-identity markers and
 * the shared RUM adapter mount in the app root layout (single session
 * collector), outside any suspense boundary, so identity focus and
 * measurement never wait on data regions. Route classes stay null
 * (unclassified) rather than inventing R-class semantics. The shell marker
 * (data-iex-shell="studio") stays on the workbench chrome, which honestly
 * reports absence outside it.
 */
/**
 * Pass 2: routes come from the single-authority contracts map (which also
 * feeds the sink allowlist), replacing the 17-prefix local duplicate.
 * Sections whose destinations render no verified identity marker
 * (/studio/apps, /studio/audio, /studio/canvas, /studio/image,
 * /studio/video, …) are honestly unmapped — samples dropped by design —
 * until each gains a real marker plus a contracts entry. Classes stay null
 * (unclassified) per the M6B-07 precedent.
 */

export default async function StudioWorkbenchLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  // V5 M1 — canonical active project: the saved selection seeds first paint;
  // the provider applies URL overrides and membership validation.
  const initialProjectId = await readActiveProjectCookie();
  const navEntries = getStudioNavEntries({ enrolled: true });
  const paletteEntries = getStudioPaletteEntries({ enrolled: true });
  // Local-only UI-inspection indicator. Rendered server-side, only when the
  // dev bypass flag is explicitly on outside production. Never visible in
  // production builds (NODE_ENV is inlined as "production" there).
  const showBypassBadge =
    process.env.NODE_ENV !== "production" &&
    process.env.ETHEN_STUDIO_LOCAL_AUTH_BYPASS === "true";
  return (
    <>
      {showBypassBadge ? (
        <div
          data-studio-bypass-badge
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            zIndex: 9999,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            lineHeight: "16px",
            background: "#3a2f10",
            color: "#f5c542",
            border: "1px solid #6b5518",
            pointerEvents: "none",
          }}
        >
          Local auth bypass
        </div>
      ) : null}
      {/* Pass 2: RUM + focus mount once in the app root layout (single
        session collector); the workbench keeps only its chrome + boot. */}
      <StudioActiveProjectProvider initialProjectId={initialProjectId}>
      <StudioWorkbenchChrome navEntries={navEntries} paletteEntries={paletteEntries}>
        <StudioWorkbenchBoot />
        <StudioWorkbenchSelectionProvider>
          <div
            data-studio-scroll-root
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
            tabIndex={0}
            role="region"
            aria-label="Studio content"
          >
            {children}
          </div>
          {/* Discovery: intercepted creation detail overlay (parallel slot). */}
          {modal}
        </StudioWorkbenchSelectionProvider>
      </StudioWorkbenchChrome>
      </StudioActiveProjectProvider>
    </>
  );
}
