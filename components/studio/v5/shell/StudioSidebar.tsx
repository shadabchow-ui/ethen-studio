"use client";

import * as React from "react";
import Link from "next/link";
import { ChatMenu } from "@ethen/ui/chat-lab/chat-menu";
import { StudioNavigation } from "./StudioNavigation";
import { StudioNavIcon } from "./studio-nav-icons";
import { StudioCreditMeter } from "../health/StudioCreditMeter";
import { useActiveProject } from "../../studio-project-scope";
import styles from "./studio-sidebar.module.css";

export interface StudioSidebarAccount {
  name: string;
  detail: string;
  initial: string;
}

const RECENT_LIMIT = 4;

/**
 * V5 M1 — Studio sidebar (Owner Lock D). Replaces the Chat sidebar content
 * inside the shared chrome: brand, New creation, the grouped Studio
 * navigation in a scroll region, real recent projects, and a pinned footer
 * (usage entry + account). Nothing here is fabricated: recents come from the
 * canonical active-project contract and usage links to Billing & Usage
 * until real credits are wired (M6).
 */
export function StudioSidebar({
  variant,
  collapsed,
  account,
  signedOut,
  onToggleCollapsed,
  onClose,
  onSearch,
  onNewCreation,
  onOpenSettings,
  onUpgrade,
  onSignIn,
  onSignOut,
}: {
  variant: "rail" | "drawer";
  collapsed: boolean;
  account: StudioSidebarAccount;
  signedOut: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  onSearch: () => void;
  onNewCreation: () => void;
  onOpenSettings: (section?: string) => void;
  onUpgrade: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const { identity, projects, selectProject } = useActiveProject();
  const railCollapsed = variant === "rail" && collapsed;
  const [accountOpen, setAccountOpen] = React.useState(false);
  const closeIfDrawer = variant === "drawer" ? onClose : undefined;
  const recent = projects.slice(0, RECENT_LIMIT);

  return (
    <div
      className={styles.sidebar}
      data-testid="studio-sidebar"
      data-variant={variant}
      data-collapsed={railCollapsed ? "true" : undefined}
    >
      <div className={styles.brandRow}>
        <Link href="/studio" className={styles.brand} aria-label="Ethen Studio" onClick={closeIfDrawer}>
          {/* Plain img: static brand asset, sized by the rail state. Logo-only per SIDEBAR_BRAND_TEXT=ETHEN_ONLY. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={railCollapsed ? "/brand/ethen-cube.png" : "/brand/ethen-logo.webp"}
            alt="Ethen"
            height={railCollapsed ? 24 : 18}
            width={railCollapsed ? 24 : undefined}
          />
        </Link>
        {variant === "drawer" ? (
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close Studio navigation">
            <StudioNavIcon name="close" />
          </button>
        ) : (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand Studio navigation" : "Collapse Studio navigation"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            <StudioNavIcon name="collapse" />
          </button>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.newCreation}
          onClick={() => {
            onNewCreation();
            closeIfDrawer?.();
          }}
          aria-label="New creation"
          title="New creation (⌘N)"
        >
          <StudioNavIcon name="plus" />
          <span className={styles.label}>New creation</span>
        </button>
        <button type="button" className={styles.searchButton} onClick={onSearch} aria-label="Search Studio" title="Search (⌘K)">
          <StudioNavIcon name="sparkle" size={14} />
          <span className={styles.label}>Search</span>
          <kbd className={styles.kbd}>⌘K</kbd>
        </button>
      </div>

      <div className={styles.scroll} data-studio-sidebar-scroll>
        <StudioNavigation projectId={identity.projectId} collapsed={railCollapsed} onNavigate={closeIfDrawer} />

        {railCollapsed ? null : (
          <section className={styles.group} aria-labelledby="studio-recent-label">
            <p className={styles.groupLabel} id="studio-recent-label">
              Recent
            </p>
            {recent.length === 0 ? (
              <p className={styles.empty}>No projects yet.</p>
            ) : (
              <ul className={styles.list}>
                {recent.map((project) => (
                  <li key={project.projectId}>
                    <Link
                      href={`/studio/projects/${encodeURIComponent(project.projectId)}`}
                      className={styles.recentRow}
                      data-active={project.projectId === identity.projectId ? "true" : undefined}
                      aria-current={project.projectId === identity.projectId ? "true" : undefined}
                      onClick={() => {
                        selectProject(project.projectId);
                        closeIfDrawer?.();
                      }}
                    >
                      <span className={styles.recentDot} aria-hidden="true" />
                      <span className={styles.label}>{project.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className={styles.foot}>
        {railCollapsed ? null : (
          <div onClick={closeIfDrawer}>
            <StudioCreditMeter projectId={identity.projectId} />
          </div>
        )}
        <Link
          href="/studio/settings?section=plan"
          className={styles.usageRow}
          aria-label="Usage and billing"
          title="Usage and billing"
          onClick={closeIfDrawer}
          data-control-state="functional"
        >
          <StudioNavIcon name="usage" size={14} />
          <span className={styles.label}>Usage</span>
        </Link>
        <ChatMenu
          label={`Account: ${account.name}`}
          placement="top"
          align="start"
          open={accountOpen}
          onOpenChange={setAccountOpen}
          triggerClassName={styles.account}
          trigger={
            <>
              <span className={styles.avatar} aria-hidden="true">
                {account.initial}
              </span>
              {railCollapsed ? null : (
                <span className={styles.accountText}>
                  <span className={styles.accountName}>{account.name}</span>
                  <span className={styles.accountDetail}>{account.detail}</span>
                </span>
              )}
            </>
          }
          groups={[
            {
              items: [
                { id: "settings", label: "Settings" },
                { id: "plan", label: "Billing & Usage" },
                { id: "upgrade", label: "Upgrade" },
              ],
            },
            { items: [signedOut ? { id: "signin", label: "Sign in" } : { id: "signout", label: "Sign out" }] },
          ]}
          onSelect={(id) => {
            setAccountOpen(false);
            if (id === "settings") onOpenSettings();
            else if (id === "plan") onOpenSettings("plan");
            else if (id === "upgrade") onUpgrade();
            else if (id === "signin") onSignIn();
            else if (id === "signout") onSignOut();
          }}
        />
      </div>
    </div>
  );
}
