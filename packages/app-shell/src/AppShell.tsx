"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { MobileSidebar } from "./MobileSidebar";
import { getNavSectionsForPath, matchRouteMeta } from "@ethen/navigation";
import { V2_GEOMETRY } from "@ethen/ui/design-system/v2/geometry";
import { ConsoleShell } from "@ethen/ui/design-system/v2/shells/ConsoleShell";
import { PlatformSidebar } from "./PlatformSidebar";
import {
  getProfilePopover,
  loadAssistantModal,
  loadKeyboardShortcutsModal,
} from "./slots";
import { Topbar } from "@ethen/ui/design-system/v2/navigation/Topbar";

const loadCommandPalette = () =>
  import("./CommandPalette").then((module) => module.CommandPalette);

const CommandPalette = dynamic(loadCommandPalette, { ssr: false });
const AssistantModal = dynamic(loadAssistantModal, { ssr: false });
const KeyboardShortcutsModal = dynamic(loadKeyboardShortcutsModal, { ssr: false });

/**
 * Derive the page title from the canonical typed route registry
 * (`lib/navigation.ts`). The registry is the single source of truth for route
 * titles; `matchRouteMeta` handles exact, dynamic-segment, and nested-route
 * resolution.
 *
 * The leading rules are bounded compatibility adapters for detail routes whose
 * displayed title is intentionally more specific than their section entry and
 * that are not enumerated in the registry (they carry no distinct metadata of
 * their own). Unknown routes fall back to the product name.
 */
function deriveTitle(pathname: string): string {
  if (pathname.startsWith("/founder-agent/portfolio")) return "Portfolio";
  if (pathname.startsWith("/agents/")) return "Fleet";
  if (pathname.startsWith("/projects/")) return "Project";
  if (pathname.startsWith("/workspace/")) return "Workspace";
  return matchRouteMeta(pathname)?.title ?? "Ethen";
}

function deriveDesktopContext(pathname: string, pageTitle: string): string | null {
  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null;

  const rootPath = `/${segments[0]}`;
  const rootLabel = matchRouteMeta(rootPath)?.title;

  if (!rootLabel || rootLabel === pageTitle) return null;

  return rootLabel;
}

interface AppShellProps {
  children: React.ReactNode;
  /** Skip the product sidebar and topbar chrome; the caller renders its own shell. */
  hideChrome?: boolean;
  /** Suppress the recent sessions section in the sidebar (e.g. on the homepage). */
  hideRecentSessions?: boolean;
  /** Hide the desktop topbar (breadcrumb + page title bar). */
  hideTopbar?: boolean;
}

/**
 * AppShell — CANONICAL base application-shell contract (FJ-08).
 *
 * Owns: navigation truth (lib/navigation.ts ROUTE_REGISTRY), the content slot,
 * mobile behavior (drawer + mobile topbar), and shared panels (command palette,
 * settings, assistant, shortcuts, profile). Specialized shells (MarketingShell,
 * MIPageShell, ConsoleLayout) are documented thin variants that reuse the same
 * chrome primitives — they are not competing authorities.
 * See artifacts/frontend-modernization/recovery/decisions/FJ-08-SHELL-AUTHORITY.md.
 */
export function AppShell({ children, hideChrome = false, hideRecentSessions = false, hideTopbar = false }: AppShellProps) {
  return <AppShellInner hideChrome={hideChrome} hideRecentSessions={hideRecentSessions} hideTopbar={hideTopbar}>{children}</AppShellInner>;
}

function AppShellInner({ children, hideChrome = false, hideRecentSessions = false, hideTopbar = false }: AppShellProps) {
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const SIDEBAR_STORAGE_KEY = "ethen:v4:sidebar-collapsed";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Sidebar starts opened (expanded) by default. localStorage values from
    // previous sessions are still respected after the first toggle, but on
    // fresh load the sidebar is expanded with a slim width.
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) return stored === "true";
    } catch { /* SSR guard */ }
    return false;
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(V2_GEOMETRY.sidebar);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number>(V2_GEOMETRY.sidebar);

  const clampSidebarWidth = (width: number) => Math.max(200, Math.min(420, width));

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    pendingWidthRef.current = sidebarWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - startXRef.current;
      pendingWidthRef.current = clampSidebarWidth(startWidthRef.current + delta);
      if (resizeFrameRef.current === null) {
        resizeFrameRef.current = requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          document.documentElement.style.setProperty("--ethen-sidebar-drag-width", `${pendingWidthRef.current}px`);
        });
      }
    };

    const onUp = () => {
      resizingRef.current = false;
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      setSidebarWidth(pendingWidthRef.current);
      document.documentElement.style.removeProperty("--ethen-sidebar-drag-width");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, [sidebarCollapsed, sidebarWidth]);

  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    const step = e.shiftKey ? 32 : 16;
    let next = sidebarWidth;
    if (e.key === "ArrowLeft") next -= step;
    else if (e.key === "ArrowRight") next += step;
    else if (e.key === "Home") next = 200;
    else if (e.key === "End") next = 420;
    else return;
    e.preventDefault();
    setSidebarWidth(clampSidebarWidth(next));
  }, [sidebarCollapsed, sidebarWidth]);
  const pathname = usePathname();
  const router = useRouter();
  const navSections = getNavSectionsForPath(pathname);
  const pageTitle = deriveTitle(pathname);
  const desktopContext = deriveDesktopContext(pathname, pageTitle);
  const hideWorkflowHomeChrome = pathname === "/workflow-agent";
  const shouldHideChrome = hideChrome || hideWorkflowHomeChrome;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const warmOverlays = () => {
      if (cancelled) return;
      void Promise.all([
        loadCommandPalette(),
        loadAssistantModal(),
        loadKeyboardShortcutsModal(),
      ]);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(warmOverlays, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(warmOverlays, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
      if (e.key === "?" && !(e.metaKey || e.ctrlKey) && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
      if (e.key === "Escape") {
        if (profileOpen) {
          e.preventDefault();
          setProfileOpen(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [profileOpen, router]);

  const openHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);

  const handleToggleCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const sidebar = !shouldHideChrome ? (
    <>
      <PlatformSidebar
        navSections={navSections}
        onOpenCommandPalette={() => setCmdPaletteOpen(true)}
        onOpenSettings={() => router.push("/settings")}
        onOpenHelp={openHelp}
        onOpenProfile={() => setProfileOpen(true)}
        profileOpen={profileOpen}
        onCloseProfile={() => setProfileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleCollapsed}
        hideRecentSessions={hideRecentSessions}
        framed={false}
      />
      {!sidebarCollapsed ? (
        <div
          className="group/resize absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize"
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={200}
          aria-valuemax={420}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
        >
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover/resize:bg-[var(--eds-rule)] group-focus-visible/resize:bg-[var(--eds-lapis-strong)]" />
        </div>
      ) : null}
    </>
  ) : undefined;

  const topbar = !shouldHideChrome ? (
    <Topbar
      title={pageTitle}
      context={desktopContext}
      onOpenMobileNav={() => setMobileSidebarOpen(true)}
      showDesktop={!hideTopbar}
      showMobile
    />
  ) : undefined;

  const ProfilePopover = getProfilePopover();

  return (
    <>
      <ConsoleShell
        data-ethen-v2
        data-v2-theme="system"
        className="bg-[var(--shell-surface-body)] text-text-primary"
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
        onSidebarCollapsedChange={(next) => {
          setSidebarCollapsed(next);
          try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
        }}
        persistSidebarState={false}
        sidebarWidthPx={sidebarCollapsed ? undefined : sidebarWidth}
        topbar={topbar}
        contentInset={false}
        contentAs="div"
      >
        {children}
      </ConsoleShell>

      {!shouldHideChrome ? (
        <MobileSidebar
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          onOpenCommandPalette={() => {
            setMobileSidebarOpen(false);
            setCmdPaletteOpen(true);
          }}
          onOpenSettings={() => {
            setMobileSidebarOpen(false);
            router.push("/settings");
          }}
          onOpenHelp={() => {
            setMobileSidebarOpen(false);
            setHelpOpen(true);
          }}
          onOpenProfile={() => {
            setMobileSidebarOpen(false);
            setProfileOpen(true);
          }}
          profileOpen={profileOpen}
          navSections={navSections}
        />
      ) : null}

      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
      />

      <AssistantModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onToggle={() => setHelpOpen(!helpOpen)}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <ProfilePopover
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenHelp={() => setHelpOpen(true)}
      />
    </>
  );
}
