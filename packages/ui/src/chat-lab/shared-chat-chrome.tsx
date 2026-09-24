"use client";

/**
 * Shared Ethen Chat chrome — one rail/resize/topbar/drawer/settings frame for
 * Chat + Studio (Studio V3 Job 1).
 *
 * Presentational + interaction-owned, conversation-free: it never imports the
 * Chat conversation runtime (useChatConversation, production/mock runtimes,
 * composer, thread, artifacts, voice). Chat keeps its run state in
 * EthenChatShell; Studio keeps workbench state in its own wrapper. Both
 * render THIS frame, so logo/cube, 288/200/420 geometry, nav row styling,
 * footer/account menu, System/Light/Dark theme, ChatMenu/popover/dialog
 * mechanics, mobile drawer and keyboard handling stay identical by
 * construction. Product navigation content is configurable via render props;
 * global styling is not forked (same CSS modules).
 *
 * Consumer contract (Jobs 2-4):
 * - `import { SharedChatChrome } from "@ethen/ui/chat-lab/shared-chat-chrome"`
 * - Controlled drawer/palette/width/collapse; sidebar + palette via render
 *   props so each product wires its own data (Chat history/projects, Studio
 *   nav entries) into the same ChatSidebar/SearchPalette components.
 * - Theme via `theme` prop (read from `@ethen/ui/theme/theme-store`
 *   `readThemePreference` with `useSyncExternalStore`); bootstrap script
 *   already in EthenDocument. Studio must import
 *   `@ethen/ui/styles/eds/chat-tokens.css` once (root layout) for vars.
 */

import * as React from "react";
import { ChatIcon } from "./chat-icons";
import {
  CHAT_SIDEBAR_DEFAULT_WIDTH,
  CHAT_SIDEBAR_KEYBOARD_LARGE_STEP,
  CHAT_SIDEBAR_KEYBOARD_STEP,
  CHAT_SIDEBAR_MAX_WIDTH,
  CHAT_SIDEBAR_MIN_WIDTH,
} from "./chat-shell-prefs";
import styles from "./ethen-chat-shell.module.css";

export interface SharedSidebarControls {
  closeDrawer: () => void;
  openSearch: () => void;
}

export interface SharedPaletteControls {
  closePalette: () => void;
}

export type SharedChromeWidthUpdate = number | ((width: number) => number);

export interface SharedChatChromeProps {
  product: "chat" | "studio";
  theme: "system" | "light" | "dark";
  routeMarker?: string;
  renderSidebar: (variant: "rail" | "drawer", controls: SharedSidebarControls) => React.ReactNode;
  sidebarLoading?: boolean;
  loadingFallback?: React.ReactNode;
  sidebarWidth: number;
  onSidebarWidth: (next: SharedChromeWidthUpdate) => void;
  railCollapsed: boolean;
  drawer: boolean;
  onDrawerChange: (open: boolean) => void;
  paletteOpen: boolean;
  onPaletteChange: (open: boolean) => void;
  renderPalette?: (controls: SharedPaletteControls) => React.ReactNode;
  onNew?: () => void;
  onEscapeOverlay?: () => void;
  topbarTitle?: React.ReactNode;
  topbarActions?: React.ReactNode;
  mainId: string;
  mainLabel: string;
  mainProps?: React.HTMLAttributes<HTMLElement> &
    Partial<Record<"data-empty" | "data-project" | "data-destination", string>>;
  dataArtifact?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
  settingsOpen?: boolean;
  renderSettingsDialog?: (controls: { onClose: () => void }) => React.ReactNode;
  onCloseSettings?: () => void;
  voice?: React.ReactNode;
  liveRegion?: React.ReactNode;
}

export function SharedChatChrome({
  product,
  theme,
  routeMarker,
  renderSidebar,
  sidebarLoading = false,
  loadingFallback = null,
  sidebarWidth,
  onSidebarWidth,
  railCollapsed,
  drawer,
  onDrawerChange,
  paletteOpen,
  onPaletteChange,
  renderPalette,
  onNew,
  onEscapeOverlay,
  topbarTitle,
  topbarActions,
  mainId,
  mainLabel,
  mainProps,
  dataArtifact = false,
  aside,
  children,
  settingsOpen = false,
  renderSettingsDialog,
  onCloseSettings,
  voice,
  liveRegion,
}: SharedChatChromeProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const paletteReturnRef = React.useRef<HTMLElement | null>(null);
  const drawerReturnRef = React.useRef<HTMLElement | null>(null);
  const drawerPanelRef = React.useRef<HTMLDivElement | null>(null);
  const resizeDragRef = React.useRef<{ startX: number; startWidth: number } | null>(null);

  const openDrawer = React.useCallback(() => {
    drawerReturnRef.current = document.activeElement as HTMLElement;
    onDrawerChange(true);
  }, [onDrawerChange]);

  const closeDrawer = React.useCallback(() => {
    onDrawerChange(false);
    drawerReturnRef.current?.focus?.();
  }, [onDrawerChange]);

  const closePalette = React.useCallback(() => {
    onPaletteChange(false);
    paletteReturnRef.current?.focus?.();
  }, [onPaletteChange]);

  const openSearch = React.useCallback(() => {
    if (drawer) paletteReturnRef.current = drawerReturnRef.current;
    onDrawerChange(false);
    onPaletteChange(true);
  }, [drawer, onDrawerChange, onPaletteChange]);

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      resizeDragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [sidebarWidth],
  );
  const handleResizePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      onSidebarWidth(drag.startWidth + (event.clientX - drag.startX));
    },
    [onSidebarWidth],
  );
  const handleResizePointerUp = React.useCallback(() => {
    resizeDragRef.current = null;
  }, []);
  const handleResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? CHAT_SIDEBAR_KEYBOARD_LARGE_STEP : CHAT_SIDEBAR_KEYBOARD_STEP;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onSidebarWidth((width) => width - step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onSidebarWidth((width) => width + step);
      }
    },
    [onSidebarWidth],
  );
  const handleResizeDoubleClick = React.useCallback(() => {
    onSidebarWidth(CHAT_SIDEBAR_DEFAULT_WIDTH);
  }, [onSidebarWidth]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        paletteReturnRef.current = document.activeElement as HTMLElement;
        onPaletteChange(true);
      } else if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        onNew?.();
      } else if (event.key === "Escape") {
        if (paletteOpen) return;
        if (drawer) return;
        onEscapeOverlay?.();
      }
    };
    const node = rootRef.current;
    node?.addEventListener("keydown", onKeyDown);
    return () => node?.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, drawer, onNew, onEscapeOverlay, onPaletteChange]);

  React.useEffect(() => {
    if (!drawer) return;
    const panel = drawerPanelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      'button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const inMenu = (event.target as HTMLElement | null)?.closest?.("[data-chat-menu-portal]");
      if (event.key === "Escape" && !inMenu) {
        event.preventDefault();
        onDrawerChange(false);
        drawerReturnRef.current?.focus?.();
        return;
      }
      if (event.key !== "Tab") return;
      const scope = [
        ...(drawerPanelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
        ...(document.querySelectorAll<HTMLElement>("[data-chat-menu-portal] button:not(:disabled)") ?? []),
      ].filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (scope.length === 0) return;
      const firstNode = scope[0];
      const lastNode = scope[scope.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [drawer, onDrawerChange]);

  const sidebarControls = React.useMemo(
    () => ({ closeDrawer, openSearch }),
    [closeDrawer, openSearch],
  );
  const paletteControls = React.useMemo(() => ({ closePalette }), [closePalette]);

  const drawerId = product === "chat" ? "chat-drawer" : "studio-drawer";
  const menuLabel =
    product === "chat" ? "Open Ethen Chat navigation" : "Open Ethen Studio navigation";
  const skipLabel = product === "chat" ? "Skip to conversation" : "Skip to workspace";

  return (
    <div
      ref={rootRef}
      className={styles.root}
      // `data-ethen-chat` is the canonical shared-shell style boundary, not a
      // product-identity marker. Studio renders this exact chrome too, so it
      // must activate the same token, theme, geometry, focus and forced-color
      // selectors. `data-ethen-studio` remains the Studio identity hook.
      data-ethen-chat
      data-ethen-studio={product === "studio" ? true : undefined}
      data-iex-shell={product === "chat" ? "chat-core" : "studio"}
      data-eds
      data-eds-theme={theme}
      data-eds-density="work"
    >
      <a className={styles.skipLink} href={`#${mainId}`}>
        {skipLabel}
      </a>

      <div
        className={styles.shell}
        data-collapsed={railCollapsed ? "true" : undefined}
        inert={drawer ? true : undefined}
      >
        <div
          className={styles.rail}
          style={{ "--chat-rail-width": `${railCollapsed ? 52 : sidebarWidth}px` } as React.CSSProperties}
        >
          {/* Render prop: controls only close over refs for event callbacks —
            nothing touches a ref during render. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {sidebarLoading ? loadingFallback : renderSidebar("rail", sidebarControls)}
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={CHAT_SIDEBAR_MIN_WIDTH}
            aria-valuemax={CHAT_SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            onKeyDown={handleResizeKeyDown}
            onDoubleClick={handleResizeDoubleClick}
          />
        </div>

        <div className={styles.main} data-artifact={dataArtifact ? "true" : undefined}>
          <header className={styles.topbar}>
            {/* The label deliberately avoids the exact string "Open navigation":
              * app/foundation-shell-compat.css targets that string with a
              * light-theme background override written for the console shell,
              * and it repaints this button white inside a dark Chat scope. */}
            <button
              type="button"
              className={styles.menuButton}
              aria-label={menuLabel}
              aria-expanded={drawer}
              aria-controls={drawerId}
              onClick={openDrawer}
            >
              <ChatIcon name="menu" size={18} />
            </button>
            {topbarTitle ? <div className={styles.topbarTitle}>{topbarTitle}</div> : null}
            {topbarActions ? <div className={styles.topbarActions}>{topbarActions}</div> : null}
          </header>

          <div className={styles.workspace} data-artifact={dataArtifact ? "true" : undefined}>
            <main
              id={mainId}
              className={styles.canvas}
              data-iex-route={routeMarker ?? undefined}
              aria-label={mainLabel}
              {...mainProps}
            >
              {children}
            </main>
            {aside ? <div className={styles.artifact}>{aside}</div> : null}
          </div>
        </div>
      </div>

      {drawer ? (
        <div id={drawerId} className={styles.drawer} role="dialog" aria-modal="true" aria-label={menuLabel}>
          <button
            type="button"
            className={styles.drawerScrim}
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={closeDrawer}
          />
          <div className={styles.drawerPanel} ref={drawerPanelRef}>
            {/* Render prop — see rail note above. */}
            {/* eslint-disable-next-line react-hooks/refs */}
            {renderSidebar("drawer", sidebarControls)}
          </div>
        </div>
      ) : null}

      {/* Render prop — see rail note above. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {renderPalette ? renderPalette(paletteControls) : null}
      {voice}
      {settingsOpen && renderSettingsDialog && onCloseSettings
        ? renderSettingsDialog({ onClose: onCloseSettings })
        : null}
      {liveRegion}
    </div>
  );
}
