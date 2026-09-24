"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Workspace } from "./Workspace";
import { MobileSidebar } from "./MobileSidebar";
import type { Agent } from "@ethen/contracts/agents/types";
import type { AgentInspectorSection } from "@ethen/contracts/agents/agent-inspector-config";
import { getAgentSidebarSections } from "@ethen/contracts/agents/sidebar-config";
import { findNavItemById } from "@ethen/navigation";
import {
  COMPOSER_PREFILL_EVENT,
  getAgentInspectorRail,
  getAgentWorkspace,
  getArtifactPanel,
  getProfilePopover,
  getWorkspaceFrame,
  loadAssistantModal,
  resolveWorkspace,
} from "./slots";

const loadCommandPalette = () =>
  import("./CommandPalette").then((module) => module.CommandPalette);

const CommandPalette = dynamic(loadCommandPalette, { ssr: false });
const AssistantModal = dynamic(loadAssistantModal, { ssr: false });

export type SerializedMessage = { id: string; role: "user" | "assistant"; content: string };

interface ConsoleLayoutProps {
  agent?: Agent;
  sessionId?: string;
  notice?: {
    tone?: "warning" | "neutral";
    title: string;
    body: string;
    cta?: { label: string; href: string };
  };
  prefill?: string;
  selectedModelId?: string;
  initialMessages?: SerializedMessage[];
  noticeOnly?: boolean;
}

interface RuntimeStatus {
  mode: "mock" | "production";
  defaultProvider: string | null;
  configured: boolean;
  providers?: Array<{
    detail: string;
    missingEnv?: string[];
  }>;
}

interface SpawnedAgentPanelProps {
  agent: Agent;
  sessionId: string;
  prefill?: string;
  selectedModelId?: string;
  initialMessages?: SerializedMessage[];
  onOpenMobileSidebar: () => void;
  onOpenCommandPalette: () => void;
  artifactPanelOpen: boolean;
  onToggleArtifactPanel: () => void;
  onCloseArtifactPanel: () => void;
}

/**
 * Owns the center workspace + right Agent Inspector pairing for one spawned session.
 * Keyed by session in the parent so switching agents/sessions remounts this (and resets
 * inspectorOverrides) instead of requiring an effect to clear stale state.
 */
function SpawnedAgentPanel({
  agent,
  sessionId,
  prefill,
  selectedModelId,
  initialMessages,
  onOpenMobileSidebar,
  onOpenCommandPalette,
  artifactPanelOpen,
  onToggleArtifactPanel,
  onCloseArtifactPanel,
}: SpawnedAgentPanelProps) {
  const isMediaWorkspace = agent.slug === "media-agent";
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorOverrides, setInspectorOverrides] =
    useState<Partial<Record<AgentInspectorSection, ReactNode>> | undefined>(undefined);
  const [inspectorFocusSection, setInspectorFocusSection] =
    useState<AgentInspectorSection | null>(null);

  const handleInspectorOpenChange = useCallback((open: boolean) => {
    setInspectorOpen(open);
  }, []);

  const handleFocusInspectorSection = useCallback((section: AgentInspectorSection) => {
    setInspectorOpen(true);
    setInspectorFocusSection(section);
  }, []);

  const handleFocusHandled = useCallback(() => {
    setInspectorFocusSection(null);
  }, []);

  const AgentWorkspace = getAgentWorkspace();
  const ArtifactPanel = getArtifactPanel();
  const AgentInspectorRail = getAgentInspectorRail();
  const factory = resolveWorkspace(agent);
  const center = factory
    ? factory({
        agent,
        sessionId,
        className: "flex-1",
        initialMessages,
        onOpenMobileSidebar,
        onOpenCommandPalette,
        onToggleArtifactPanel,
        onInspectorContentChange: setInspectorOverrides,
        onFocusInspectorSection: handleFocusInspectorSection,
        onInspectorOpenChange: handleInspectorOpenChange,
      })
    : (
      <AgentWorkspace
        agent={agent}
        sessionId={sessionId}
        className="flex-1"
        initialMessages={initialMessages}
        selectedModelId={selectedModelId}
        onOpenMobileSidebar={onOpenMobileSidebar}
        onOpenCommandPalette={onOpenCommandPalette}
        onToggleArtifactPanel={onToggleArtifactPanel}
      />
    );

  return (
    <>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">{center}</div>

      {/* Right: artifact panel — lg+ only */}
      {artifactPanelOpen && (
        <div className="animate-slide-right hidden xl:flex">
          <ArtifactPanel sessionId={sessionId} agent={agent} onClose={onCloseArtifactPanel} />
        </div>
      )}

      {/* Right: agent inspector — the single agent-specific sidebar, xl+ only */}
      {!isMediaWorkspace && inspectorOpen && (
        <div className="hidden xl:flex">
          <AgentInspectorRail
            agent={agent}
            sessionId={sessionId}
            prefill={prefill}
            onClose={() => setInspectorOpen(false)}
            overrideSections={inspectorOverrides}
            focusSection={inspectorFocusSection}
            onFocusHandled={handleFocusHandled}
          />
        </div>
      )}
    </>
  );
}

function RuntimeChip({ status }: { status: RuntimeStatus | null }) {
  if (!status) return null;
  const runtimeDetail =
    status.providers?.find((provider) => provider.missingEnv?.length)?.detail ??
    status.providers?.find((provider) => !provider.missingEnv?.length)?.detail ??
    `Runtime: ${status.mode}`;
  const isMock = status.mode === "mock";
  const label = isMock
    ? "Mock"
    : status.configured
    ? `Live · ${status.defaultProvider ?? "auto"}`
    : `No provider`;
  const color = isMock
    ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
    : status.configured
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : "bg-red-500/15 text-red-400 border-red-500/25";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${color}`}
      title={runtimeDetail}
    >
      {label}
    </span>
  );
}

/**
 * ConsoleLayout — specialized agent-workspace shell (FJ-08 documented thin
 * variant): agent-scoped sidebar sections, artifact panel, runtime-status
 * chip, and composer prefill on top of the SHARED chrome primitives
 * (Sidebar, MobileSidebar, CommandPalette, modals, ProfilePopover). It does
 * not own route truth — navigation resolution goes through lib/navigation.ts.
 * See artifacts/frontend-modernization/recovery/decisions/FJ-08-SHELL-AUTHORITY.md.
 */
export function ConsoleLayout({ agent, sessionId, notice, prefill, selectedModelId, initialMessages, noticeOnly }: ConsoleLayoutProps) {
  const router = useRouter();
  const agentSidebarSections = getAgentSidebarSections(agent?.slug ?? "");
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const SIDEBAR_STORAGE_KEY = "ethen:v4:sidebar-collapsed";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Default to compact icon rail. Stale localStorage "false" values are
    // ignored — the sidebar always starts collapsed on fresh load. The
    // toggle handler still writes to localStorage for session consistency.
    return true;
  });
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const showRuntimeChip = agent?.slug !== "research-agent";

  const handleToggleCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const warmOverlays = () => {
      if (cancelled) return;
      void Promise.all([
        loadCommandPalette(),
        loadAssistantModal(),
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
    let cancelled = false;
    fetch("/api/runtime-status")
      .then((r) => {
        if (!r.ok) throw new Error(`Runtime status unavailable (HTTP ${r.status})`);
        return r.json();
      })
      .then((data: RuntimeStatus) => {
        if (!cancelled) setRuntimeStatus(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[ConsoleLayout] Failed to fetch runtime status:", err);
          setRuntimeStatus({ mode: "mock", defaultProvider: null, configured: false });
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Prefill composer when launching from a template or rerun
  const prefillDispatched = useRef(false);
  useEffect(() => {
    if (!prefill || prefillDispatched.current) return;
    prefillDispatched.current = true;
    const timer = setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent(COMPOSER_PREFILL_EVENT, {
            detail: { text: prefill, mode: "replace" },
          })
        );
      } catch (err) {
        console.error("[ConsoleLayout] prefill dispatch failed", err);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [prefill]);

  // Global Cmd/Ctrl+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSectionItemClick = useCallback((action: string, itemId: string) => {
    const normalized = action.trim();
    const navMatch = findNavItemById(normalized) ?? findNavItemById(itemId);

    if (normalized === "settings" || itemId === "settings") {
      router.push("/settings");
      setMobileSidebarOpen(false);
      return;
    }

    if (normalized === "help" || itemId === "help") {
      setHelpOpen(true);
      setMobileSidebarOpen(false);
      return;
    }

    if (normalized === "profile" || itemId === "profile") {
      setProfileOpen(true);
      setMobileSidebarOpen(false);
      return;
    }

    if (normalized.startsWith("/")) {
      router.push(normalized);
      setMobileSidebarOpen(false);
      return;
    }

    if (navMatch?.href) {
      router.push(navMatch.href);
      setMobileSidebarOpen(false);
      return;
    }

    console.warn("[ConsoleLayout] Unhandled agent sidebar action", { action: normalized, itemId });
  }, [router]);

  const WorkspaceFrame = getWorkspaceFrame();
  const ArtifactPanel = getArtifactPanel();
  const ProfilePopover = getProfilePopover();

  return (
    <WorkspaceFrame title={agent?.name ?? "Workspace"}>
      {showRuntimeChip && runtimeStatus && (
        <div
          className="fixed bottom-3 right-3 z-50 pointer-events-none"
          style={{ bottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))`, right: `calc(0.75rem + env(safe-area-inset-right, 0px))` }}
        >
          <RuntimeChip status={runtimeStatus} />
        </div>
      )}
      <div className="flex h-full overflow-hidden bg-[var(--bg-base)]">
        {/* Left sidebar — hidden on mobile */}
        <div className="hidden md:flex">
          <Sidebar
            currentSessionId={sessionId}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={handleToggleCollapsed}
            onOpenCommandPalette={() => setCmdPaletteOpen(true)}
            onOpenSettings={() => router.push("/settings")}
            onOpenHelp={() => setHelpOpen(true)}
            onOpenProfile={() => setProfileOpen(true)}
            profileOpen={profileOpen}
            agentSidebarSections={agentSidebarSections}
            onSectionItemClick={handleSectionItemClick}
          />
        </div>

        {agent && sessionId ? (
          <SpawnedAgentPanel
            key={`${agent.slug}:${sessionId}`}
            agent={agent}
            sessionId={sessionId}
            prefill={prefill}
            selectedModelId={selectedModelId}
            initialMessages={initialMessages}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onOpenCommandPalette={() => setCmdPaletteOpen(true)}
            artifactPanelOpen={artifactPanelOpen}
            onToggleArtifactPanel={() => setArtifactPanelOpen((v) => !v)}
            onCloseArtifactPanel={() => setArtifactPanelOpen(false)}
          />
        ) : (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Workspace
              className="flex-1"
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              onOpenCommandPalette={() => setCmdPaletteOpen(true)}
              notice={notice}
              noticeOnly={noticeOnly}
            />
          </div>
        )}
      </div>

      {/* Mobile sidebar drawer */}
      <MobileSidebar
        currentSessionId={sessionId}
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onOpenCommandPalette={() => {
          setMobileSidebarOpen(false);
          setCmdPaletteOpen(true);
        }}
        agentSidebarSections={agentSidebarSections}
        onOpenSettings={() => router.push("/settings")}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        profileOpen={profileOpen}
        onSectionItemClick={handleSectionItemClick}
      />

      {/* Command palette */}
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
      />

      <AssistantModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onToggle={() => setHelpOpen(!helpOpen)}
      />

      <ProfilePopover
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {artifactPanelOpen && agent && (
        <div className="fixed inset-0 z-40 flex justify-end lg:hidden">
          <div
            className="animate-overlay-in absolute inset-0 bg-black/50 backdrop-blur-[3px]"
            onClick={() => setArtifactPanelOpen(false)}
            aria-hidden
          />
          <ArtifactPanel
            sessionId={sessionId ?? null}
            agent={agent}
            onClose={() => setArtifactPanelOpen(false)}
            className="animate-slide-right relative h-full w-full max-w-[92vw] shadow-xl"
          />
        </div>
      )}
    </WorkspaceFrame>
  );
}
