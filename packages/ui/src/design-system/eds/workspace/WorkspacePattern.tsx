"use client";

/**
 * EDS WorkspacePattern — D10 candidate.
 *
 * One responsive conversation/workspace architecture in four modes:
 * conversation (conversation owns the surface), artifact (workspace owns
 * the surface), split (fixed-pixel conversation column beside the
 * workspace), and full (artifact full-screen as a mode, never a route).
 * Mode switches preserve conversation, draft, artifact, version, and prior
 * mode — Escape from full restores the mode that opened it.
 *
 * Inherits the containing EDS surface scope (theme + density). Do not add
 * data-eds here: a bare scope re-declares Dark values and traps the theme.
 */
import * as React from "react";
import { Icon } from "../../../icons";
import { EdsMenu, type EdsMenuItem } from "../primitives/Menu";
import {
  ARTIFACT_KINDS,
  MAX_VISIBLE_ARTIFACT_TABS,
  versionLabel,
  type ArtifactKind,
  type ArtifactTab,
} from "./ArtifactSurface";
import {
  DIVIDER_DEFAULT_WIDTH,
  DIVIDER_STEP,
  clampDividerWidth,
  loadDividerWidth,
  saveDividerWidth,
} from "./divider-preference";

export type WorkspaceMode = "conversation" | "artifact" | "split" | "full";

export type WorkspaceView = "conversation" | "work";

export interface WorkspacePatternProps {
  mode: WorkspaceMode;
  view?: WorkspaceView;
  onViewChange?: (view: WorkspaceView) => void;
  conversation: React.ReactNode;
  evidenceSlot?: React.ReactNode;
  /**
   * Persistent Evidence affordance (D11). The Workspace header owns it below
   * 1280 so the Evidence trigger is never a sibling column that compresses
   * Work. Null while the persistent Evidence rail is on screen.
   */
  headerSlot?: React.ReactNode;
  tabs: readonly ArtifactTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  streamingTabIds?: readonly string[];
  onCompare?: (tab: ArtifactTab) => void;
  onEnterFull?: () => void;
  onExitFull?: (previousMode: WorkspaceMode) => void;
  previousMode?: WorkspaceMode;
  conversationWidth?: number;
  onConversationWidthChange?: (width: number) => void;
  emptyWorkspaceLabel?: string;
  className?: string;
  id?: string;
}

const KIND_ICON: Record<ArtifactKind, "files" | "terminal" | "project" | "sessions"> = {
  Document: "files",
  Code: "terminal",
  Slides: "project",
  Table: "sessions",
  Browser: "sessions",
  Terminal: "terminal",
};

function SplitDivider({
  width,
  onWidthChange,
}: {
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const dragging = React.useRef(false);

  const commit = React.useCallback(
    (next: number) => {
      onWidthChange(clampDividerWidth(next));
    },
    [onWidthChange],
  );

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragging.current = true;
    trackRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !trackRef.current) return;
    const track = trackRef.current.getBoundingClientRect();
    commit(track.left + track.width / 2 === 0 ? width : width + event.movementX);
  }

  function onPointerUp() {
    dragging.current = false;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commit(width - DIVIDER_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commit(width + DIVIDER_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      commit(340);
    } else if (event.key === "End") {
      event.preventDefault();
      commit(420);
    }
  }

  return (
    <div
      ref={trackRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize conversation column"
      aria-valuemin={340}
      aria-valuemax={420}
      aria-valuenow={width}
      tabIndex={0}
      className="eds-workspace__divider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}

function ArtifactTabs({
  tabs,
  activeTabId,
  onTabChange,
  streamingTabIds,
  label,
}: {
  tabs: readonly ArtifactTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  streamingTabIds: readonly string[];
  label: string;
}) {
  const visible = tabs.slice(0, MAX_VISIBLE_ARTIFACT_TABS);
  const overflow = tabs.slice(MAX_VISIBLE_ARTIFACT_TABS);
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const [focusIndex, setFocusIndex] = React.useState(() =>
    Math.max(0, visible.findIndex((tab) => tab.record.id === activeTabId)),
  );
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const bounded = (index + visible.length) % visible.length;
    setFocusIndex(bounded);
    refs.current[bounded]?.focus();
  }

  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(visible.length - 1);
    }
  }

  function selectTab(id: string, index: number) {
    setFocusIndex(index);
    onTabChange(id);
  }

  const overflowItems: readonly EdsMenuItem[] = overflow.map((tab) => ({
    label: tab.content.title,
    icon: KIND_ICON[tab.content.kind],
    onSelect: () => {
      setOverflowOpen(false);
      onTabChange(tab.record.id);
    },
  }));

  return (
    <div className="eds-workspace__tabs" role="tablist" aria-label={label}>
      {visible.map((tab, index) => {
        const selected = tab.record.id === activeTabId;
        const streaming = streamingTabIds.includes(tab.record.id);
        return (
          <button
            key={tab.record.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`eds-artifact-tab-${tab.record.id}`}
            aria-selected={selected}
            aria-controls={`eds-artifact-panel-${tab.record.id}`}
            tabIndex={focusIndex === index ? 0 : -1}
            onClick={() => selectTab(tab.record.id, index)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={["eds-workspace__tab", selected ? "eds-workspace__tab--selected" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <span aria-hidden className="eds-workspace__tab-icon">
              <Icon name={KIND_ICON[tab.content.kind]} size={16} />
            </span>
            <span className="eds-workspace__tab-label">{tab.content.kind}</span>
            {streaming ? (
              <span className="eds-workspace__tab-stream" role="status" aria-label={`${tab.content.title} updating`}>
                Updating
              </span>
            ) : null}
          </button>
        );
      })}
      {overflow.length > 0 ? (
        <div className="eds-workspace__overflow">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((open) => !open)}
            className="eds-workspace__tab eds-workspace__tab--overflow"
          >
            +{overflow.length} more
          </button>
          {overflowOpen ? (
            <EdsMenu items={overflowItems} label="More artifacts" onClose={() => setOverflowOpen(false)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceHeader({
  tab,
  onCompare,
  onEnterFull,
  isFull,
  onExitFull,
  previousMode,
  headerSlot,
}: {
  tab: ArtifactTab | undefined;
  onCompare?: (tab: ArtifactTab) => void;
  onEnterFull?: () => void;
  isFull: boolean;
  onExitFull?: (previousMode: WorkspaceMode) => void;
  previousMode: WorkspaceMode;
  headerSlot?: React.ReactNode;
}) {
  const current = tab?.versions.find((candidate) => tab && candidate.id === tab.record.currentVersionId);
  const lineage = tab ? [...tab.versions].sort((a, b) => a.version - b.version) : [];
  return (
    <div className="eds-workspace__header">
      <div className="eds-workspace__identity">
        <p className="eds-workspace__kind">{tab ? tab.content.kind : "Workspace"}</p>
        <h2 className="eds-workspace__title">{tab ? tab.content.title : "No artifact selected"}</h2>
      </div>
      <div className="eds-workspace__controls">
        {headerSlot ? <div className="eds-workspace__header-slot">{headerSlot}</div> : null}
        {tab ? (
          <p className="eds-workspace__version" aria-label={`Current version ${current ? versionLabel(current.version) : "unknown"}`}>
            {current ? versionLabel(current.version) : "v—"}
            {lineage.length > 1 ? (
              <span className="eds-workspace__lineage">
                {" "}
                of {lineage.length} ({lineage.map((entry) => versionLabel(entry.version)).join(", ")})
              </span>
            ) : null}
          </p>
        ) : null}
        {tab && lineage.length > 1 ? (
          <button type="button" className="eds-workspace__control" onClick={() => onCompare?.(tab)}>
            Compare
          </button>
        ) : null}
        {isFull ? (
          <button
            type="button"
            className="eds-workspace__control"
            onClick={() => onExitFull?.(previousMode)}
          >
            Exit full screen
          </button>
        ) : (
          <button type="button" className="eds-workspace__control" onClick={() => onEnterFull?.()}>
            Full screen
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkspacePattern({
  mode,
  view = "conversation",
  onViewChange,
  conversation,
  evidenceSlot,
  headerSlot,
  tabs,
  activeTabId,
  onTabChange,
  streamingTabIds = [],
  onCompare,
  onEnterFull,
  onExitFull,
  previousMode = "split",
  conversationWidth,
  onConversationWidthChange,
  emptyWorkspaceLabel = "No artifact selected yet.",
  className,
  id = "eds-workspace-pattern",
}: WorkspacePatternProps) {
  const [persistedWidth, setPersistedWidth] = React.useState<number>(() => loadDividerWidth() ?? DIVIDER_DEFAULT_WIDTH);
  const width = conversationWidth ?? persistedWidth;

  const commitWidth = React.useCallback(
    (next: number) => {
      const clamped = clampDividerWidth(next);
      if (conversationWidth === undefined) setPersistedWidth(clamped);
      saveDividerWidth(clamped);
      onConversationWidthChange?.(clamped);
    },
    [conversationWidth, onConversationWidthChange],
  );

  const activeTab = tabs.find((tab) => tab.record.id === activeTabId);
  const isFull = mode === "full";

  React.useEffect(() => {
    if (!isFull) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onExitFull?.(previousMode);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFull, onExitFull, previousMode]);

  const showConversation = mode === "conversation" || mode === "split" || (mode === "full" && false);
  const showWorkspace = mode === "artifact" || mode === "split" || mode === "full";

  const conversationPane = (
    <div className="eds-workspace__conversation" style={mode === "split" ? { width: `${width}px` } : undefined}>
      {conversation}
    </div>
  );

  const workspacePane = (
    <div className="eds-workspace__pane">
      <WorkspaceHeader
        tab={activeTab}
        headerSlot={headerSlot}
        onCompare={onCompare}
        onEnterFull={onEnterFull}
        isFull={isFull}
        onExitFull={onExitFull}
        previousMode={previousMode}
      />
      <ArtifactTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        streamingTabIds={streamingTabIds}
        label="Artifacts"
      />
      <div
        role="tabpanel"
        id={`eds-artifact-panel-${activeTab?.record.id ?? "empty"}`}
        aria-labelledby={activeTab ? `eds-artifact-tab-${activeTab.record.id}` : undefined}
        aria-label={activeTab ? activeTab.content.title : "Empty workspace"}
        tabIndex={0}
        className="eds-workspace__panel"
      >
        {activeTab ? (
          <div key={activeTab.record.id} className="eds-workspace__artifact">
            {activeTab.content.body}
          </div>
        ) : (
          <p className="eds-workspace__empty">{emptyWorkspaceLabel}</p>
        )}
      </div>
      {evidenceSlot ? (
        <aside aria-label="Evidence" className="eds-workspace__evidence">
          {evidenceSlot}
        </aside>
      ) : null}
    </div>
  );

  return (
    <div
      id={id}
      data-workspace-mode={mode}
      className={["eds-workspace", `eds-workspace--${mode}`, className].filter(Boolean).join(" ")}
    >
      <div className="eds-workspace__switch" role="tablist" aria-label="Conversation and work">
        {(["conversation", "work"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={entry === view}
            aria-controls={entry === "conversation" ? "eds-workspace-conversation" : "eds-workspace-pane"}
            tabIndex={entry === view ? 0 : -1}
            onClick={() => onViewChange?.(entry)}
            className={["eds-workspace__switch-tab", entry === view ? "eds-workspace__switch-tab--selected" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {entry === "conversation" ? "Conversation" : "Work"}
          </button>
        ))}
      </div>
      {mode === "split" ? (
        <div className="eds-workspace__split">
          <div id="eds-workspace-conversation">{showConversation ? conversationPane : null}</div>
          {showConversation ? (
            <SplitDivider width={width} onWidthChange={commitWidth} />
          ) : null}
          <div id="eds-workspace-pane">{showWorkspace ? workspacePane : null}</div>
        </div>
      ) : (
        <div className="eds-workspace__stack">
          {mode === "conversation" ? <div id="eds-workspace-conversation">{conversationPane}</div> : null}
          {mode === "artifact" || mode === "full" ? <div id="eds-workspace-pane">{workspacePane}</div> : null}
        </div>
      )}
    </div>
  );
}

export { ARTIFACT_KINDS, MAX_VISIBLE_ARTIFACT_TABS };
export type { ArtifactKind, ArtifactTab };
