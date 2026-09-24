"use client";

/**
 * EDS Topbar — D09 candidate.
 *
 * Global and contextual controls only: menu trigger, quiet search/command
 * affordance, product launcher trigger, caller-provided utility and account
 * slots. No product-specific buttons.
 */
import * as React from "react";
import { Icon, type IconName } from "../../../icons";

export interface EdsTopbarProps {
  contextLabel?: string;
  menuIcon?: IconName;
  onMenu?: () => void;
  onSearchTrigger?: () => void;
  onLauncher?: () => void;
  launcherButtonRef?: React.RefObject<HTMLButtonElement | null>;
  launcherOpen?: boolean;
  utilitySlot?: React.ReactNode;
  accountSlot?: React.ReactNode;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
}

export function EdsTopbar({
  contextLabel = "Workspace",
  menuIcon = "grid",
  onMenu,
  onSearchTrigger,
  onLauncher,
  launcherButtonRef,
  launcherOpen = false,
  utilitySlot,
  accountSlot,
  menuButtonRef,
  className,
}: EdsTopbarProps) {
  return (
    <header className={["eds-topbar", className].filter(Boolean).join(" ")}>
      {onMenu ? (
        <button ref={menuButtonRef} type="button" className="eds-topbar__menu" onClick={onMenu} aria-label="Open navigation">
          <span aria-hidden className="eds-topbar__menu-icon">
            <Icon name={menuIcon} size={16} />
          </span>
        </button>
      ) : null}
      <span className="eds-topbar__context">{contextLabel}</span>
      <div className="eds-topbar__center">
        {onSearchTrigger ? (
          <button type="button" className="eds-topbar__search" onClick={onSearchTrigger} aria-keyshortcuts="meta+k control+k">
            <span aria-hidden className="eds-topbar__search-icon">
              <Icon name="search" size={16} />
            </span>
            <span className="eds-topbar__search-label">Search</span>
            <kbd className="eds-topbar__search-keys" aria-hidden>
              ⌘K
            </kbd>
          </button>
        ) : null}
      </div>
      <div className="eds-topbar__actions">
        {onLauncher ? (
          <button
            ref={launcherButtonRef}
            type="button"
            className="eds-topbar__launcher"
            onClick={onLauncher}
            aria-expanded={launcherOpen}
            aria-haspopup="dialog"
            aria-label="Open product launcher"
          >
            <span aria-hidden className="eds-topbar__launcher-icon">
              <Icon name="grid" size={16} />
            </span>
          </button>
        ) : null}
        {utilitySlot}
        {accountSlot}
      </div>
    </header>
  );
}
