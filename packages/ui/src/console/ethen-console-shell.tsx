"use client";

/**
 * Production Ethen Console application shell.
 *
 * Promoted from the certified Console lab for the post-launch UI correction.
 * Presentation is identical to the certified shell: the frame is the sidebar,
 * there is no marketing navbar, no marketing footer and no global application
 * header above the canvas. Below 768px a genuine mobile top bar appears and
 * the rail becomes a drawer; the two are never on screen together.
 *
 * Production contract: workspace identity, account identity, palette
 * commands/recents/docs and every figure inside `children` come from caller
 * props — production sources (auth/session, API, workspace state). This
 * module carries no mock rows and never imports design-lab fixtures.
 */
import * as React from "react";
import { EdsButton } from "@ethen/ui/design-system/eds/primitives/Button";
import { EdsKbd } from "@ethen/ui/design-system/eds/primitives/Chrome";
import { ConsoleDialog, isConsoleDialogOpen } from "./console-primitives";
import { ConsoleIcon, type ConsoleIconName } from "./console-icons";
import {
  type ConsoleAccount,
  type ConsolePaletteItem,
  type ConsoleWorkspace,
  type WorkspaceId,
} from "./console-production-data";
import {
  CONSOLE_DESTINATIONS,
  CONSOLE_NAV,
  CONSOLE_UTILITIES,
  groupOwning,
  type ConsoleDestination,
} from "./console-nav";
import {
  clampFlyout,
  loadConsolePreferences,
  resolveEscapeAction,
  saveConsolePreferences,
} from "./console-overlays";
import {
  useDismissOutside,
  useFocusTrap,
  useInitialFocus,
  useLockBodyScroll,
  useMenuKeyboard,
  useRestoreFocus,
} from "./console-overlay-hooks";
import styles from "./ethen-console-shell.module.css";

export type ConsoleTheme = "system" | "light" | "dark";

/** Which floating layer, if any, is open. Only one at a time, always. */
type Layer = "none" | "workspace" | "account" | "palette" | "drawer";

/**
 * Honest fallbacks when the caller has not (yet) supplied production
 * identity. A single current-workspace entry and a neutral account — never
 * demo workspaces or a demo person.
 */
const DEFAULT_WORKSPACES: readonly ConsoleWorkspace[] = [
  { id: "default", name: "Workspace", detail: "Current workspace" },
];

const DEFAULT_ACCOUNT: ConsoleAccount = {
  name: "Account",
  role: "Member",
  email: "",
  initials: "A",
};

export type ConsoleShellProps = {
  theme?: ConsoleTheme;
  /** The destination the rail marks as current. */
  active?: string;
  children?: React.ReactNode;
  /** Declarative initial layer (loading/error screenshots, keyboard review). */
  initialLayer?: Layer;
  collapsed?: boolean;
  /** Collapsed-rail flyout, by group id. */
  initialFlyout?: string | null;
  /** Immersive flagship mode: the rail collapses and a context bar appears. */
  immersive?: React.ReactNode;
  /** The degraded banner. Reading continues; writes are disabled. */
  degraded?: boolean;
  /**
   * CONSOLE_C3 — Retry performs a deterministic local recovery attempt.
   * Without a handler it reloads the document (a real recovery, not a
   * dead button).
   */
  onRetryConnection?: () => void;
  onWorkspaceChange?: (workspace: WorkspaceId) => void;
  workspace?: WorkspaceId;
  /**
   * Workspaces listed in the workspace menu. Defaults to a single honest
   * entry for the current workspace — never demo workspaces.
   */
  workspaces?: readonly ConsoleWorkspace[];
  /** Organization label shown in the workspace and account menus. */
  organizationName?: string;
  /**
   * Account identity shown in the rail footer and account menu. The caller
   * passes the production session identity when available; the default is a
   * neutral placeholder, never a demo person.
   */
  account?: ConsoleAccount;
  /**
   * CONSOLE_C2 — Appearance writes through to the authoritative Ethen theme
   * store. Without a handler the Appearance row is intentionally disabled
   * with a reason instead of dismissing silently.
   */
  onThemeChange?: (theme: ConsoleTheme) => void;
  /**
   * CONSOLE_C2 — persist collapse/group preference through the narrow local
   * mechanism. Off by default so initial renders stay declarative.
   */
  persistPreferences?: boolean;
  /**
   * CONSOLE_C1 — connected mode. When `onNavigate` is present the shell is
   * controlled: `active` is the destination (not a separate label) and every
   * rail, flyout, drawer and palette selection reports through it, so the
   * sidebar destination always equals the rendered destination. Without it the
   * shell keeps local selection state.
   */
  onNavigate?: (destination: string) => void;
  /** Palette commands, recents and docs — every row resolves to something real. */
  onCommand?: (commandId: string) => void;
  /**
   * Command-palette sections. Commands resolve through `onCommand`;
   * destinations resolve through `onNavigate`. Default to empty so the
   * palette only ever offers rows the caller can actually fulfil.
   */
  paletteCommands?: readonly ConsolePaletteItem[];
  paletteRecent?: readonly ConsolePaletteItem[];
  paletteDocs?: readonly ConsolePaletteItem[];
};

/* CONSOLE_C4 — tablet viewports (768–1023) default to the collapsed 52px
 * rail. Server-safe: unknown viewports keep the desktop default. */
function isTabletViewport(): boolean {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(min-width: 768px) and (max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

export function EthenConsoleShell({
  theme = "system",
  active = "dashboard",
  children,
  initialLayer = "none",
  collapsed: collapsedProp = false,
  initialFlyout = null,
  immersive,
  degraded = false,
  onRetryConnection,
  onWorkspaceChange,
  workspace: workspaceProp,
  workspaces = DEFAULT_WORKSPACES,
  organizationName = "Ethen",
  account = DEFAULT_ACCOUNT,
  onNavigate,
  onCommand,
  onThemeChange,
  persistPreferences = false,
  paletteCommands = [],
  paletteRecent = [],
  paletteDocs = [],
}: ConsoleShellProps) {
  /* CONSOLE_C2 — stored rail preference seeds state only when persistence is
   * opted in (the connected app); declarative initial renders stay untouched. */
  const [persisted] = React.useState(() => (persistPreferences ? loadConsolePreferences() : {}));
  /* CONSOLE_C4 — at tablet widths the rail defaults to collapsed: the stored
   * preference still wins, and the toggle keeps working after mount. */
  const [collapsed, setCollapsed] = React.useState(
    persisted.collapsed ?? (collapsedProp || isTabletViewport()),
  );
  /* CONSOLE_C2 — the mobile drawer is separate state from desktop layers, so
   * opening workspace/account inside the drawer never dismisses it. */
  const [layer, setLayer] = React.useState<Layer>(initialLayer === "drawer" ? "none" : initialLayer);
  const [drawerOpen, setDrawerOpen] = React.useState(initialLayer === "drawer");
  const [flyout, setFlyout] = React.useState<string | null>(initialFlyout);
  /* CONSOLE_C5 — the keyboard-shortcuts dialog is shell chrome: it opens from
   * the account menu and closes back to it via dialog focus restoration. */
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  /* The flyout is positioned in VIEWPORT coordinates, not inside the rail.
   * `.navScroll` scrolls, and a scroll container clips on both axes — an
   * absolutely-positioned flyout beside a collapsed rail is cut off at the
   * rail's edge. Anchoring to the button's rect is what actually escapes it. */
  const [flyoutAnchor, setFlyoutAnchor] = React.useState<{ top: number; left: number } | null>(null);
  const [uncontrolledWorkspace, setUncontrolledWorkspace] = React.useState<WorkspaceId>("default");
  const workspace = workspaceProp ?? uncontrolledWorkspace;
  const controlled = onNavigate !== undefined;
  const [internalCurrent, setInternalCurrent] = React.useState(active);
  /* Connected mode: the destination IS the selection. No second label exists to drift. */
  const current = controlled ? active : internalCurrent;
  const [openGroups, setOpenGroups] = React.useState<readonly string[]>(() => {
    if (persisted.openGroups) return persisted.openGroups;
    const owner = groupOwning(active);
    return owner ? [owner] : [];
  });

  /* CONSOLE_C2 — narrow local persistence: collapse + group preference only. */
  React.useEffect(() => {
    if (persistPreferences) saveConsolePreferences({ collapsed, openGroups });
  }, [persistPreferences, collapsed, openGroups]);

  /* A destination arriving from outside (Back/Forward, palette command,
   * dashboard action) opens its owning group exactly like a click does.
   * Adjust-during-render, not an effect: the open group is derived from the
   * destination, and it is additive only — user expansion choices are never
   * reset. */
  const currentOwner = groupOwning(current);
  const [expandedFor, setExpandedFor] = React.useState<string | null>(currentOwner);
  if (expandedFor !== currentOwner) {
    setExpandedFor(currentOwner);
    if (currentOwner) {
      setOpenGroups((groups) => (groups.includes(currentOwner) ? groups : [...groups, currentOwner]));
    }
  }

  /* `collapsed` and `active` seed state and nothing more: the caller declares
   * the initial presentation and then the user drives the shell. Syncing them
   * back from props in an effect would fight every interaction (and cascade a
   * render on every prop identity change), so they seed state and nothing
   * more. React's adjust-during-render pattern is used below where a reset
   * genuinely is derived from an input. */

  /* Cmd/Ctrl+K opens the palette; Esc closes the TOP layer only (dialog >
   * palette > menu/flyout > drawer). The shortcut deliberately does NOT fire
   * while a text input has focus (spec §101), so search never intercepts
   * ordinary typing. Layers that handle their own Escape preventDefault, which
   * keeps this fallback from double-closing them. */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        /* CONSOLE_C5_1 — an open dialog owns the screen; the palette never
         * layers above it (it would render inside the inert shell). */
        if (isConsoleDialogOpen()) return;
        if (typing && !target.closest(`.${styles.paletteInputWrap}`)) return;
        event.preventDefault();
        setLayer((open) => (open === "palette" ? "none" : "palette"));
        return;
      }
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        const action = resolveEscapeAction({
          dialog: false,
          palette: layer === "palette",
          menu: layer === "workspace" || layer === "account",
          flyout: flyout !== null,
          drawer: drawerOpen,
        });
        if (action === "none") return;
        if (action === "palette" || action === "menu") setLayer("none");
        if (action === "flyout") {
          setFlyout(null);
          setFlyoutAnchor(null);
        }
        if (action === "drawer") setDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [layer, flyout, drawerOpen]);

  const selectWorkspace = (next: WorkspaceId) => {
    if (workspaceProp === undefined) setUncontrolledWorkspace(next);
    onWorkspaceChange?.(next);
    setLayer("none");
  };

  /* One resolver for rail, flyouts, drawer and palette: sidebar, dashboard
   * links, search results and product launch all arrive here. It closes the
   * layer it was opened from, preserves workspace, and — in connected mode —
   * reports the destination instead of keeping local state. */
  const go = (destination: string) => {
    if (!controlled) setInternalCurrent(destination);
    const owner = groupOwning(destination);
    if (owner) setOpenGroups((groups) => (groups.includes(owner) ? groups : [...groups, owner]));
    onNavigate?.(destination);
    setLayer("none");
    setFlyout(null);
    setFlyoutAnchor(null);
    /* Drawer navigation closes the drawer; desktop layers are unaffected. */
    setDrawerOpen(false);
  };

  const runCommand = (commandId: string) => {
    setLayer("none");
    setFlyout(null);
    setFlyoutAnchor(null);
    onCommand?.(commandId);
  };

  /* CONSOLE_C2 — the flyout remembers its trigger so Escape can restore focus
   * and scroll/resize can reposition instead of stranding it. */
  const accountTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  /* CONSOLE_C5 — closing the shortcuts dialog returns focus to the account
   * trigger even though the opening menu unmounted mid-flight (the dialog's
   * own restore targets whatever survived; the rAF runs after unmount
   * cleanups, so it always wins deterministically). */
  const closeShortcuts = React.useCallback(() => {
    setShortcutsOpen(false);
    const trigger = accountTriggerRef.current;
    if (trigger) {
      requestAnimationFrame(() => {
        if (document.contains(trigger)) trigger.focus({ preventScroll: true });
      });
    }
  }, []);
  const flyoutTrigger = React.useRef<HTMLElement | null>(null);
  const flyoutNode = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const closeFlyout = React.useCallback((refocusTrigger = false) => {
    setFlyout(null);
    setFlyoutAnchor(null);
    if (refocusTrigger) flyoutTrigger.current?.focus({ preventScroll: true });
  }, []);

  const openFlyout = (groupId: string, trigger: HTMLElement) => {
    flyoutTrigger.current = trigger;
    const rect = trigger.getBoundingClientRect();
    setFlyoutAnchor({ top: Math.max(8, rect.top - 6), left: rect.right + 14 });
    setFlyout((open) => (open === groupId ? null : groupId));
  };

  /* Reposition (never off-screen) on open, rail scroll and window resize —
   * the viewport clamp from the A1 clipping fix, kept on every geometry
   * change. rAF-throttled; scroll and resize share one frame. */
  React.useEffect(() => {
    if (flyout === null) return;
    let frame = 0;
    const reposition = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const node = flyoutNode.current;
        const trigger = flyoutTrigger.current;
        const size = {
          width: node?.offsetWidth ?? 240,
          height: node?.offsetHeight ?? 320,
        };
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        if (trigger) {
          const rect = trigger.getBoundingClientRect();
          setFlyoutAnchor(
            clampFlyout(Math.max(8, rect.top - 6), rect.right + 14, size, viewport),
          );
        } else if (node) {
          setFlyoutAnchor((anchor) =>
            anchor ? clampFlyout(anchor.top, anchor.left, size, viewport) : anchor,
          );
        }
      });
    };
    reposition();
    const scroller = scrollerRef.current;
    window.addEventListener("resize", reposition);
    scroller?.addEventListener("scroll", reposition, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      scroller?.removeEventListener("scroll", reposition);
    };
  }, [flyout]);

  /* A declarative initial flyout has no click rect to anchor to. A ref callback
   * measures the group's own button on mount — the idiomatic measure-at-commit
   * escape hatch, and the reason this is not a layout effect. */
  const seedAnchor = (node: HTMLButtonElement | null, groupId: string) => {
    if (!node || groupId !== initialFlyout || flyoutAnchor) return;
    const rect = node.getBoundingClientRect();
    setFlyoutAnchor({ top: Math.max(8, rect.top - 6), left: rect.right + 14 });
  };

  /* CONSOLE_C2 — drawer focus system: initial focus on the explicit close
   * control, containment while open, inert + scroll-locked background, focus
   * restored to the menu button on close. Desktop collapse state is untouched
   * by all of this. */
  const railRef = React.useRef<HTMLElement | null>(null);
  const drawerCloseRef = React.useRef<HTMLButtonElement | null>(null);
  useRestoreFocus(drawerOpen);
  useFocusTrap(railRef, drawerOpen);
  useLockBodyScroll(drawerOpen);
  React.useEffect(() => {
    if (!drawerOpen) return;
    const frame = window.requestAnimationFrame(() =>
      drawerCloseRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [drawerOpen]);

  const paletteOpen = layer === "palette";
  const modalBackground = drawerOpen || paletteOpen;

  const railCollapsed = collapsed || Boolean(immersive);
  const activeWorkspace = workspaces.find((candidate) => candidate.id === workspace) ?? workspaces[0] ?? DEFAULT_WORKSPACES[0];

  return (
    <div
      className={styles.shell}
      data-ethen-console
      data-eds
      data-eds-theme={theme}
      data-eds-density="work"
      data-collapsed={railCollapsed ? "true" : "false"}
    >
      {/* Mobile only. Never rendered beside the icon rail (spec §107). */}
      <header className={styles.mobileBar}>
        <button
          type="button"
          className={styles.mobileMenu}
          aria-expanded={drawerOpen}
          aria-controls="console-rail"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <ConsoleIcon name="menu" />
          <span className={styles.srOnly}>Console navigation</span>
        </button>
        <span className={styles.mobileTitle}>
          {CONSOLE_DESTINATIONS.find((destination) => destination.id === current)?.label ?? "Console"}
        </span>
        <button type="button" className={styles.mobileMenu} onClick={() => setLayer("palette")}>
          <ConsoleIcon name="search" />
          <span className={styles.srOnly}>Search Console</span>
        </button>
      </header>

      {drawerOpen ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <nav
        id="console-rail"
        className={styles.rail}
        aria-label="Console"
        data-open={drawerOpen ? "true" : "false"}
        ref={railRef}
        inert={paletteOpen ? true : undefined}
      >
        <div className={styles.brandRow}>
          <span className={styles.brand}>
            <span className={styles.brandName}>Ethen</span>
            <span className={styles.brandQualifier}>Console</span>
          </span>
          <span className={styles.brandMark} aria-hidden>
            E
          </span>
          <button
            type="button"
            className={styles.railToggle}
            onClick={() => {
              setCollapsed((value) => !value);
              setFlyout(null);
            }}
            aria-pressed={railCollapsed}
          >
            <ConsoleIcon name="rail" />
            <span className={styles.srOnly}>{railCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
            <Tip>{railCollapsed ? "Expand sidebar" : "Collapse sidebar"}</Tip>
          </button>
          <button
            type="button"
            className={styles.drawerClose}
            ref={drawerCloseRef}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <ConsoleIcon name="close" />
          </button>
        </div>

        <div className={styles.context}>
          <div className={styles.menuAnchor}>
            <button
              type="button"
              className={styles.workspaceButton}
              aria-haspopup="menu"
              aria-expanded={layer === "workspace"}
              onClick={() => setLayer(layer === "workspace" ? "none" : "workspace")}
            >
              <ConsoleIcon name="workspace" className={styles.workspaceMark} />
              <span className={styles.workspaceName}>{activeWorkspace.name}</span>
              <ConsoleIcon name="chevron-down" className={styles.workspaceChevron} />
              <Tip>Workspace · {activeWorkspace.name}</Tip>
            </button>
            {layer === "workspace" ? (
              <WorkspaceMenu
                current={workspace}
                workspaces={workspaces}
                organizationName={organizationName}
                onSelect={selectWorkspace}
                onNavigate={go}
                onClose={() => setLayer("none")}
              />
            ) : null}
          </div>

          <button type="button" className={styles.search} onClick={() => setLayer("palette")}>
            <ConsoleIcon name="search" className={styles.searchIcon} />
            <span className={styles.searchLabel}>Search Console…</span>
            <EdsKbd className={styles.searchKbd}>⌘K</EdsKbd>
            <Tip>Search Console · ⌘K</Tip>
          </button>
        </div>

        <div className={styles.navScroll} ref={scrollerRef}>
          <ul className={styles.navList}>
            {CONSOLE_NAV.map((entry) =>
              entry.kind === "destination" ? (
                <li key={entry.destination.id}>
                  <RailItem
                    destination={entry.destination}
                    current={current === entry.destination.id}
                    onSelect={() => go(entry.destination.id)}
                  />
                </li>
              ) : (
                <li key={entry.id} className={styles.groupItem}>
                  <button
                    type="button"
                    className={styles.groupButton}
                    ref={(node) => {
                      seedAnchor(node, entry.id);
                    }}
                    aria-expanded={railCollapsed ? undefined : openGroups.includes(entry.id)}
                    aria-controls={railCollapsed ? undefined : `console-group-${entry.id}`}
                    aria-haspopup={railCollapsed ? "menu" : undefined}
                    data-within={entry.items.some((item) => item.id === current) ? "true" : undefined}
                    onClick={(event) => {
                      if (railCollapsed) {
                        openFlyout(entry.id, event.currentTarget);
                        return;
                      }
                      setOpenGroups((groups) =>
                        groups.includes(entry.id) ? groups.filter((id) => id !== entry.id) : [...groups, entry.id],
                      );
                    }}
                  >
                    <ConsoleIcon name={entry.icon} className={styles.rowIcon} />
                    <span className={styles.rowLabel}>{entry.label}</span>
                    <ConsoleIcon
                      name="chevron-down"
                      className={styles.groupChevron}
                      data-open={openGroups.includes(entry.id) ? "true" : "false"}
                    />
                    <Tip>{entry.label}</Tip>
                  </button>

                  {railCollapsed ? (
                    flyout === entry.id ? (
                      <FlyoutMenu
                        label={entry.label}
                        items={entry.items}
                        current={current}
                        anchor={flyoutAnchor}
                        nodeRef={flyoutNode}
                        onNavigate={go}
                        onClose={closeFlyout}
                      />
                    ) : null
                  ) : (
                    <ul
                      id={`console-group-${entry.id}`}
                      className={styles.subList}
                      hidden={!openGroups.includes(entry.id)}
                    >
                      {entry.items.map((item) => (
                        <li key={item.id}>
                          <RailItem
                            destination={item}
                            current={current === item.id}
                            nested
                            onSelect={() => go(item.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className={styles.railFoot}>
          <ul className={styles.navList}>
            {CONSOLE_UTILITIES.map((utility) => (
              <li key={utility.id}>
                <RailItem
                  destination={utility}
                  current={current === utility.id}
                  onSelect={() => go(utility.id)}
                />
              </li>
            ))}
            <li>
              <a className={styles.railLink} href="https://chat.upcube.ai" target="_blank" rel="noreferrer">
                <ConsoleIcon name="chat" className={styles.rowIcon} />
                <span className={styles.rowLabel}>Open Ethen Chat</span>
                <ConsoleIcon name="external" className={styles.rowTrailing} />
                <Tip>Open Ethen Chat ↗</Tip>
              </a>
            </li>
          </ul>

          <div className={styles.menuAnchor}>
            <button
              type="button"
              className={styles.accountButton}
              aria-haspopup="menu"
              aria-expanded={layer === "account"}
              ref={accountTriggerRef}
              onClick={() => setLayer(layer === "account" ? "none" : "account")}
            >
              <span className={styles.avatar} aria-hidden>
                {account.initials}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{account.name}</span>
                <span className={styles.accountRole}>
                  {account.role} · {organizationName}
                </span>
              </span>
              <ConsoleIcon name="more" className={styles.accountMore} />
              <Tip>
                {account.name} · {account.role}
              </Tip>
            </button>
            {layer === "account" ? (
              <AccountMenu
                onClose={() => setLayer("none")}
                workspace={activeWorkspace.name}
                account={account}
                organizationName={organizationName}
                theme={theme}
                onThemeChange={onThemeChange}
                onNavigate={go}
                onShowShortcuts={() => {
                  setLayer("none");
                  setShortcutsOpen(true);
                }}
              />
            ) : null}
          </div>
        </div>
      </nav>

      {/* CONSOLE_C5 — script-focusable landmark: leaving immersive mode moves
       * focus here because the Back trigger unmounts with the context bar. */}
      <div className={styles.main} data-console-main tabIndex={-1} inert={modalBackground ? true : undefined}>
        {degraded ? (
          <div className={styles.degraded} role="status">
            <ConsoleIcon name="warning" />
            <span>Connection lost. Showing cached data — changes are disabled until the Console reconnects.</span>
            <EdsButton
              variant="secondary"
              density="compact"
              className={styles.degradedAction}
              onClick={onRetryConnection ?? (() => window.location.reload())}
            >
              Retry
            </EdsButton>
          </div>
        ) : null}
        {immersive ? <div className={styles.immersiveBar}>{immersive}</div> : null}
        <div className={styles.canvas}>{children}</div>
      </div>

      {layer === "palette" ? (
        <CommandPalette
          onClose={() => setLayer("none")}
          onSelect={go}
          onCommand={runCommand}
          commands={paletteCommands}
          recent={paletteRecent}
          docs={paletteDocs}
        />
      ) : null}
      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
    </div>
  );
}

/* A tooltip that only appears while the rail is collapsed. Visual-only: the
 * label already lives in the accessibility tree, so this is hidden from it. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.tip} role="tooltip" aria-hidden="true">
      {children}
    </span>
  );
}

function RailItem({
  destination,
  current,
  nested = false,
  badgeCount,
  onSelect,
}: {
  destination: ConsoleDestination;
  current: boolean;
  nested?: boolean;
  badgeCount?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.railItem}
      data-nested={nested ? "true" : undefined}
      data-current={current ? "true" : undefined}
      aria-current={current ? "page" : undefined}
      onClick={onSelect}
    >
      <ConsoleIcon name={destination.icon} className={styles.rowIcon} />
      <span className={styles.rowLabel}>{destination.label}</span>
      {destination.badge ? <span className={styles.rowBadge}>{destination.badge}</span> : null}
      {badgeCount ? (
        <span className={styles.rowCount}>
          {badgeCount}
          <span className={styles.srOnly}> unread</span>
        </span>
      ) : null}
      <Tip>{destination.label}</Tip>
    </button>
  );
}

/* ------------------------------------------------------------------- menus */

function WorkspaceMenu({
  current,
  workspaces,
  organizationName,
  onSelect,
  onNavigate,
  onClose,
}: {
  current: WorkspaceId;
  workspaces: readonly ConsoleWorkspace[];
  organizationName: string;
  onSelect: (workspace: WorkspaceId) => void;
  /**
   * CONSOLE_C5 — workspace administration lives on the Workspaces surface.
   * Create/Manage navigate there instead of dismissing the menu silently.
   */
  onNavigate: (destination: string) => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const menuKeyboard = useMenuKeyboard();
  useDismissOutside(ref, onClose);
  useRestoreFocus(true);
  /* Initial focus lands on the selected workspace, else the first item. */
  useInitialFocus(ref, true);
  return (
    <div
      className={styles.menu}
      role="menu"
      aria-label="Workspace"
      ref={ref}
      data-placement="below"
      onKeyDown={menuKeyboard}
    >
      <p className={styles.menuSection}>Organization</p>
      <div className={styles.menuOrg}>
        <ConsoleIcon name="manage" />
        <span>{organizationName}</span>
      </div>
      <hr className={styles.menuRule} />
      <p className={styles.menuSection}>Workspaces</p>
      {workspaces.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          role="menuitemradio"
          aria-checked={candidate.id === current}
          className={styles.menuItem}
          onClick={() => onSelect(candidate.id)}
        >
          <ConsoleIcon name="workspace" className={styles.menuIcon} />
          <span className={styles.menuItemText}>
            <span>{candidate.name}</span>
            <span className={styles.menuItemDetail}>{candidate.detail}</span>
          </span>
          {candidate.id === current ? <ConsoleIcon name="check" className={styles.menuCheck} /> : null}
        </button>
      ))}
      <hr className={styles.menuRule} />
      <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onNavigate("workspaces")}>
        <ConsoleIcon name="plus" className={styles.menuIcon} />
        Create workspace
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => onNavigate("workspaces")}
      >
        <ConsoleIcon name="workspaces" className={styles.menuIcon} />
        Manage workspaces
      </button>
    </div>
  );
}

/* The collapsed-rail flyout: viewport-anchored (never clipped by the rail
 * scroller), clamped on scroll/resize, keyboard-navigable, focused on open,
 * and restoring its trigger on Escape-driven close. */
function FlyoutMenu({
  label,
  items,
  current,
  anchor,
  nodeRef,
  onNavigate,
  onClose,
}: {
  label: string;
  items: readonly ConsoleDestination[];
  current: string;
  anchor: { top: number; left: number } | null;
  nodeRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (destination: string) => void;
  onClose: (refocusTrigger?: boolean) => void;
}) {
  const menuKeyboard = useMenuKeyboard();
  useRestoreFocus(true);
  useInitialFocus(nodeRef, true);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    menuKeyboard(event);
  };
  return (
    <div
      className={styles.flyout}
      role="menu"
      aria-label={label}
      ref={nodeRef}
      style={anchor ? { top: anchor.top, left: anchor.left } : undefined}
      onKeyDown={onKeyDown}
    >
      <p className={styles.flyoutTitle}>{label}</p>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={styles.flyoutItem}
          data-current={current === item.id ? "true" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <ConsoleIcon name={item.icon} className={styles.rowIcon} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

const THEME_MODES: readonly Readonly<{ id: ConsoleTheme; label: string; detail: string }>[] = [
  { id: "system", label: "System", detail: "Follow this device" },
  { id: "light", label: "Light", detail: "Mineral paper" },
  { id: "dark", label: "Dark", detail: "Ground lapis" },
];

function AccountMenu({
  onClose,
  workspace,
  account,
  organizationName,
  theme,
  onThemeChange,
  onNavigate,
  onShowShortcuts,
}: {
  onClose: () => void;
  workspace: string;
  account: ConsoleAccount;
  organizationName: string;
  theme: ConsoleTheme;
  onThemeChange?: (theme: ConsoleTheme) => void;
  /**
   * CONSOLE_C5 — settings navigate to real surfaces. Every visible row is
   * functional, explicitly disabled with a reason, or the wired Appearance
   * submenu: nothing dismisses the menu silently.
   */
  onNavigate: (destination: string) => void;
  onShowShortcuts: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const menuKeyboard = useMenuKeyboard();
  const [appearanceOpen, setAppearanceOpen] = React.useState(false);
  useDismissOutside(ref, onClose);
  useRestoreFocus(true);
  useInitialFocus(ref, true);
  const appearanceWired = onThemeChange !== undefined;
  return (
    <div
      className={styles.menu}
      role="menu"
      aria-label="Account"
      ref={ref}
      data-placement="above"
      onKeyDown={menuKeyboard}
    >
      {account.email ? <p className={styles.menuIdentity}>{account.email}</p> : null}
      <div className={styles.menuContext}>
        <span>{organizationName}</span>
        <span className={styles.menuItemDetail}>{workspace} workspace</span>
      </div>
      <hr className={styles.menuRule} />
      <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onNavigate("org-settings")}>
        <ConsoleIcon name="org-settings" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Organization settings</span>
      </button>
      <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onNavigate("members")}>
        <ConsoleIcon name="members" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Personal settings</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        aria-expanded={appearanceWired ? appearanceOpen : undefined}
        aria-haspopup={appearanceWired ? "menu" : undefined}
        disabled={appearanceWired ? undefined : true}
        title={appearanceWired ? undefined : "Appearance is not adjustable here."}
        onClick={() => {
          if (appearanceWired) setAppearanceOpen((open) => !open);
          else onClose();
        }}
      >
        <ConsoleIcon name="reveal" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Appearance</span>
        <ConsoleIcon name="chevron-right" className={styles.menuCheck} data-open={appearanceOpen ? "true" : undefined} />
      </button>
      {appearanceWired && appearanceOpen ? (
        <div role="group" aria-label="Appearance">
          {THEME_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === mode.id}
              className={styles.menuItem}
              data-nested="true"
              onClick={() => {
                onThemeChange(mode.id);
                onClose();
              }}
            >
              <span className={styles.menuItemText}>
                <span>{mode.label}</span>
                <span className={styles.menuItemDetail}>{mode.detail}</span>
              </span>
              {theme === mode.id ? <ConsoleIcon name="check" className={styles.menuCheck} /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" role="menuitem" className={styles.menuItem} onClick={onShowShortcuts}>
        <ConsoleIcon name="developer" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Keyboard shortcuts</span>
      </button>
      <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onNavigate("documentation")}>
        <ConsoleIcon name="info" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Help</span>
      </button>
      {/* CONSOLE_C5 — intentionally disabled: no lab equivalent exists, and a
       * silent dismiss would read as a broken control. */}
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        disabled
        title="Language is fixed to English."
      >
        <ConsoleIcon name="documentation" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Language</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        disabled
        title="Legal documents are not available here."
      >
        <ConsoleIcon name="credentials" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Legal</span>
      </button>
      <hr className={styles.menuRule} />
      <a className={styles.menuItem} role="menuitem" href="https://chat.upcube.ai" target="_blank" rel="noreferrer">
        <ConsoleIcon name="chat" className={styles.menuIcon} />
        <span className={styles.menuItemText}>Open Ethen Chat</span>
        <ConsoleIcon name="external" className={styles.menuCheck} />
      </a>
      <hr className={styles.menuRule} />
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        disabled
        title="Sign out is not available here."
      >
        <ConsoleIcon name="back" className={styles.menuIcon} />
        Sign out
      </button>
    </div>
  );
}

/* CONSOLE_C5 — the shortcuts dialog the account menu opens. Every row names a
 * shortcut the Console actually implements; there is no decorative list. */
const CONSOLE_SHORTCUTS: readonly (readonly [React.ReactNode, string])[] = [
  ["⌘K or Ctrl+K", "Open or close the command palette"],
  ["Esc", "Close the top layer: dialog, palette, menu, flyout, then drawer"],
  ["↑ / ↓", "Move through menus, flyouts and palette results"],
  ["Home / End", "Jump to the first or last menu or palette row"],
  ["Enter", "Open the highlighted destination or confirm the dialog"],
  ["← / →", "Inspect chart points once the chart has focus"],
  ["Tab / Shift+Tab", "Move through a dialog; focus stays trapped inside"],
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ConsoleDialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="The full Console flow — sidebar, palette, dialogs, tables and charts — works without a pointer."
      width={480}
    >
      <dl className={styles.shortcutsList}>
        {CONSOLE_SHORTCUTS.map(([keys, action]) => (
          <div key={action} className={styles.shortcutsRow}>
            <dt className={styles.shortcutsKeys}>
              <EdsKbd>{keys}</EdsKbd>
            </dt>
            <dd className={styles.shortcutsAction}>{action}</dd>
          </div>
        ))}
      </dl>
    </ConsoleDialog>
  );
}

/* --------------------------------------------------------- command palette */

type PaletteRow = Readonly<{
  id: string;
  label: string;
  detail: string;
  icon: ConsoleIconName;
  group: string;
  destination?: string;
}>;

function paletteRows(
  query: string,
  sections: {
    recent: readonly ConsolePaletteItem[];
    commands: readonly ConsolePaletteItem[];
    docs: readonly ConsolePaletteItem[];
  },
): readonly PaletteRow[] {
  const rows: PaletteRow[] = [
    ...sections.recent.map((item) => ({ ...item, group: "Recent" })),
    ...CONSOLE_DESTINATIONS.map((destination) => ({
      id: `go-${destination.id}`,
      label: destination.label,
      detail: destination.route,
      icon: destination.icon,
      group: destination.group === "Documentation" ? "Documentation" : "Go to",
      destination: destination.id,
    })),
    ...sections.commands.map((command) => ({ ...command, group: "Commands" })),
    ...sections.docs.map((doc) => ({ ...doc, group: "Documentation" })),
  ];
  const needle = query.trim().toLowerCase();
  if (!needle) return rows.filter((row) => row.group !== "Documentation" || row.id.startsWith("doc-"));
  return rows.filter(
    (row) => row.label.toLowerCase().includes(needle) || row.detail.toLowerCase().includes(needle),
  );
}

const PALETTE_ORDER = ["Recent", "Go to", "Commands", "Documentation"] as const;

function CommandPalette({
  onClose,
  onSelect,
  onCommand,
  commands,
  recent,
  docs,
}: {
  onClose: () => void;
  onSelect: (destination: string) => void;
  onCommand?: (commandId: string) => void;
  commands: readonly ConsolePaletteItem[];
  recent: readonly ConsolePaletteItem[];
  docs: readonly ConsolePaletteItem[];
}) {
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);
  const rows = React.useMemo(
    () => paletteRows(query, { recent, commands, docs }),
    [query, recent, commands, docs],
  );
  const ordered = React.useMemo(
    () =>
      PALETTE_ORDER.flatMap((group) => rows.filter((row) => row.group === group)).slice(0, 24),
    [rows],
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const activeId = ordered[index]?.id;

  /* CONSOLE_C2 — the palette owns focus while open: contained Tab, restored
   * opener, locked scroll. The input takes initial focus. */
  useFocusTrap(dialogRef, true);
  useRestoreFocus(true);
  useLockBodyScroll(true);
  React.useEffect(() => inputRef.current?.focus(), []);

  /* Keep the active result visible as Arrow/Home/End move it. */
  React.useEffect(() => {
    if (!activeId) return;
    document.getElementById(`palette-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // Adjust state during render rather than in an effect: a new query must land
  // with the first row already highlighted, not one paint later.
  const [lastQuery, setLastQuery] = React.useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setIndex(0);
  }

  /* Every row performs its action: destinations navigate, commands/recents/
   * docs resolve through the same action resolver as their visible controls.
   * Enter and click commit identically. */
  const commit = (row: PaletteRow | undefined) => {
    if (!row) return onClose();
    if (row.destination) return onSelect(row.destination);
    if (onCommand) return onCommand(row.id);
    onClose();
  };

  return (
    <div className={styles.paletteScrim} onMouseDown={onClose}>
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Search Console"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.paletteHead}>
          <p className={styles.paletteTitle}>Search Console</p>
          <button type="button" className={styles.paletteClose} onClick={onClose} aria-label="Close search">
            <ConsoleIcon name="close" />
          </button>
        </div>
        <div className={styles.paletteInputWrap}>
          <ConsoleIcon name="search" className={styles.paletteIcon} />
          <input
            ref={inputRef}
            className={styles.paletteInput}
            placeholder="Search Console…"
            value={query}
            role="combobox"
            aria-expanded
            aria-controls="console-palette-results"
            aria-activedescendant={activeId ? `palette-${activeId}` : undefined}
            aria-autocomplete="list"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((value) => Math.min(value + 1, ordered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((value) => Math.max(value - 1, 0));
              } else if (event.key === "Home") {
                event.preventDefault();
                setIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setIndex(Math.max(0, ordered.length - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                commit(ordered[index]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <EdsKbd className={styles.paletteKbd}>Esc</EdsKbd>
        </div>
        <div className={styles.paletteResults} id="console-palette-results" role="listbox" aria-label="Results">
          {ordered.length === 0 ? (
            <p className={styles.paletteEmpty}>No Console destination, command or document matches “{query}”.</p>
          ) : (
            PALETTE_ORDER.map((group) => {
              const groupRows = ordered.filter((row) => row.group === group);
              if (groupRows.length === 0) return null;
              return (
                <div key={group} className={styles.paletteGroup}>
                  <p className={styles.paletteGroupTitle}>{group}</p>
                  {groupRows.map((row) => (
                    <button
                      key={row.id}
                      id={`palette-${row.id}`}
                      type="button"
                      role="option"
                      aria-selected={row.id === activeId}
                      className={styles.paletteRow}
                      data-active={row.id === activeId ? "true" : undefined}
                      onMouseEnter={() => setIndex(ordered.findIndex((candidate) => candidate.id === row.id))}
                      onClick={() => commit(row)}
                    >
                      <ConsoleIcon name={row.icon} className={styles.paletteRowIcon} />
                      <span className={styles.paletteRowLabel}>{row.label}</span>
                      <span className={styles.paletteRowDetail}>{row.detail}</span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
        <p className={styles.paletteFoot}>
          <span>
            <EdsKbd>↑</EdsKbd> <EdsKbd>↓</EdsKbd> navigate
          </span>
          <span>
            <EdsKbd>↵</EdsKbd> open
          </span>
          <span>
            <EdsKbd>Esc</EdsKbd> close
          </span>
          <span className={styles.paletteFootNote}>Secrets are never searched.</span>
        </p>
      </div>
    </div>
  );
}
