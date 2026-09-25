"use client";

/**
 * Studio V3 Job 1 → V5 M1 — authenticated workbench chrome (client wrapper).
 *
 * Renders the shared chrome (`SharedChatChrome`: drawer, palette, keyboard,
 * resize) with Studio content only: the Studio sidebar (Owner Lock D), the
 * Studio palette entries, and the Studio account menu. Studio always renders
 * the dark console (Lock C); the flush-frame overrides live in the
 * Studio-scoped `app/studio/studio-theme.css` (Lock B).
 *
 * Access boundaries (S4C auth-on-action): pages render publicly
 * (signed-out included); session + project-membership guards stay at the
 * API routes and the studio-access-guard proxy, and submit paths pre-gate
 * through the Studio auth-action provider (Clerk modal, drafts
 * preserved). Public review never renders here.
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { SharedChatChrome } from "@ethen/ui/chat-lab/shared-chat-chrome";
import { SearchPalette, type PaletteAction } from "@ethen/ui/chat-lab/search-palette";
import type { SearchResult } from "@ethen/ui/chat-lab/chat-fixtures";
import { useAsyncData, type AccountInfo } from "@ethen/ui/settings/settings-data";
import type { StudioNavEntry, StudioPaletteEntry } from "@ethen/navigation";
import { StudioSidebar } from "./v5/shell/StudioSidebar";
import { StudioAuthActionProvider, requestStudioSignIn } from "./auth/studio-auth-action";

const STUDIO_ACTIONS: readonly PaletteAction[] = [
  { id: "new-studio-project", label: "New Studio project", beta: true },
];

// Singular hierarchy: the Studio sidebar is the only visible Studio
// navigation; registry navEntries remain a prop for API compatibility.

function toPaletteResults(entries: readonly StudioPaletteEntry[]): SearchResult[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.label,
    group: "Studio" as const,
    detail: entry.group,
  }));
}

/**
 * V5 M1 — Studio rail geometry (Owner Lock D): 224px default within the
 * approved 212–232px band, resizable 200–320, collapsible to the icon rail.
 * Stored separately from Chat's rail so neither product resizes the other.
 */
const STUDIO_SIDEBAR_PREFS_KEY = "ethen.studio.sidebar.v1";
const STUDIO_SIDEBAR_DEFAULT_WIDTH = 224;
const STUDIO_SIDEBAR_MIN_WIDTH = 200;
const STUDIO_SIDEBAR_MAX_WIDTH = 320;

type StudioSidebarPrefs = { width: number; collapsed: boolean };

function clampStudioSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return STUDIO_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(STUDIO_SIDEBAR_MAX_WIDTH, Math.max(STUDIO_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function useStudioSidebarPrefs(): [StudioSidebarPrefs, (update: (current: StudioSidebarPrefs) => StudioSidebarPrefs) => void] {
  const [prefs, setPrefs] = React.useState<StudioSidebarPrefs>({ width: STUDIO_SIDEBAR_DEFAULT_WIDTH, collapsed: false });
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STUDIO_SIDEBAR_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StudioSidebarPrefs>;
      // Post-hydration restore of a per-viewer convenience.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs({
        width: clampStudioSidebarWidth(Number(parsed.width)),
        collapsed: parsed.collapsed === true,
      });
    } catch {
      // Storage unavailable: defaults apply.
    }
  }, []);
  const update = React.useCallback((fn: (current: StudioSidebarPrefs) => StudioSidebarPrefs) => {
    setPrefs((current) => {
      const next = fn(current);
      const clamped = { width: clampStudioSidebarWidth(next.width), collapsed: next.collapsed };
      try {
        window.localStorage.setItem(STUDIO_SIDEBAR_PREFS_KEY, JSON.stringify(clamped));
      } catch {
        // Non-persistent convenience.
      }
      return clamped;
    });
  }, []);
  return [prefs, update];
}

export function StudioWorkbenchChrome({
  navEntries,
  paletteEntries,
  routeMarker,
  children,
}: {
  navEntries: readonly StudioNavEntry[];
  paletteEntries: readonly StudioPaletteEntry[];
  routeMarker?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarPrefs, updateSidebarPrefs] = useStudioSidebarPrefs();
  const [drawer, setDrawer] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [signedOutFlip, setSignedOutFlip] = React.useState(false);
  const account = useAsyncData<AccountInfo>("/api/settings/account");
  // Job 06B — profile display name mirrors Chat (never the raw auth subject).
  const [profileName, setProfileName] = React.useState<string | null>(null);
  const accountSignedIn = account.data?.signedIn === true;
  React.useEffect(() => {
    if (!accountSignedIn) return;
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.json().catch(() => null))
      .then((body) => {
        if (cancelled) return;
        const general = (body as { settings?: { general?: { preferredName?: unknown; fullName?: unknown } } } | null)?.settings?.general;
        const preferred = typeof general?.preferredName === "string" ? general.preferredName.trim() : "";
        const full = typeof general?.fullName === "string" ? general.fullName.trim() : "";
        if (preferred || full) setProfileName(preferred || full);
      })
      .catch(() => {
        // Profile is best-effort; the footer keeps its safe fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [accountSignedIn]);

  // Singular hierarchy: registry rows are not rendered as a second nav.
  void navEntries;
  const paletteResults = React.useMemo(() => toPaletteResults(paletteEntries), [paletteEntries]);
  const paletteHrefs = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of paletteEntries) map.set(entry.id, entry.href);
    return map;
  }, [paletteEntries]);

  const handleNavigate = React.useCallback(
    (href: string) => {
      setDrawer(false);
      router.push(href);
    },
    [router],
  );

  // New creation enters the Create surface (wired to the rail button, ⌘N
  // and the palette action alike).
  const handleNewCreation = React.useCallback(() => {
    setDrawer(false);
    router.push("/studio/create/image");
  }, [router]);

  const handleOpenSettings = React.useCallback(
    (section?: string) => {
      setDrawer(false);
      router.push(section ? `/studio/settings?section=${encodeURIComponent(section)}` : "/studio/settings");
    },
    [router],
  );

  // S4C: modal-first sign-in (Studio stays visible, drafts preserved);
  // the auth-action provider falls back to /sign-in navigation when the
  // Clerk modal API is unavailable.
  const handleSignIn = React.useCallback(() => {
    requestStudioSignIn({ action: "chrome-sign-in" });
  }, []);

  const handleSignOut = React.useCallback(async () => {
    setSignedOutFlip(true);
    try {
      await fetch("/api/settings/sessions/current", { method: "DELETE" });
    } catch {
      // Server-owned cookie; a failed call still ends here.
    }
    // Intentional hard navigation: the session ends server-side above; Studio
    // has no /sign-out Clear-Site-Data route, so land on /sign-in directly.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== "undefined") window.location.assign("/sign-in");
  }, []);

  const handleUpgrade = React.useCallback(() => {
    router.push("/upgrade");
  }, [router]);

  // Job 06B — account footer mirrors Chat's states exactly: an account
  // object is always passed (loading/signed-out/signed-in), so the lab
  // fixture never flashes; detail is the product name like Chat's.
  const sidebarAccount = React.useMemo(() => {
    if (!account.data) return { name: "Loading…", detail: "Checking session", initial: "…" };
    if (!account.data.signedIn || !account.data.actorId) {
      return { name: "Not signed in", detail: "Sign in required", initial: "?" };
    }
    const name = profileName ?? "Signed in";
    return {
      name,
      detail: account.data.ownerReview ? "Local review" : "Ethen Studio",
      initial: name.slice(0, 1).toUpperCase(),
    };
  }, [account.data, profileName]);

  const signedOut = signedOutFlip || (account.data ? !account.data.signedIn : false);

  return (
    <SharedChatChrome
      product="studio"
      // V5 M1 (Owner Lock C): Studio always renders the dark console.
      theme="dark"
      routeMarker={routeMarker ?? pathname ?? "/studio"}
      renderSidebar={(variant, controls) => (
        <StudioSidebar
          variant={variant}
          collapsed={sidebarPrefs.collapsed}
          account={sidebarAccount}
          signedOut={signedOut}
          onToggleCollapsed={() => updateSidebarPrefs((current) => ({ ...current, collapsed: !current.collapsed }))}
          onClose={controls.closeDrawer}
          onSearch={controls.openSearch}
          onNewCreation={handleNewCreation}
          onOpenSettings={handleOpenSettings}
          onUpgrade={handleUpgrade}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      )}
      onNew={handleNewCreation}
      sidebarWidth={sidebarPrefs.width}
      onSidebarWidth={(next) =>
        updateSidebarPrefs((current) => ({
          ...current,
          width: typeof next === "function" ? next(current.width) : next,
        }))
      }
      railCollapsed={sidebarPrefs.collapsed}
      drawer={drawer}
      onDrawerChange={setDrawer}
      paletteOpen={paletteOpen}
      onPaletteChange={setPaletteOpen}
      renderPalette={(controls) => (
        <SearchPalette
          open={paletteOpen}
          onClose={controls.closePalette}
          live
          results={paletteResults}
          actions={STUDIO_ACTIONS}
          onActivate={(result) => {
            if (result.id === "new-studio-project") {
              handleNewCreation();
              return;
            }
            const href = paletteHrefs.get(result.id);
            if (href) handleNavigate(href);
          }}
        />
      )}
      mainId="studio-main"
      mainLabel="Studio workspace"
    >
      <StudioAuthActionProvider>{children}</StudioAuthActionProvider>
    </SharedChatChrome>
  );
}
