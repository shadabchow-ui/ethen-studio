"use client";

/**
 * EDS ManagedShell — D09 candidate convenience path.
 *
 * Data-driven shell over the composable EdsAppShell: sidebar items, launcher
 * products, and caller slots. Owns collapsed/drawer/launcher state internally
 * so Lab specimens and future callers stay small; the structural slots remain
 * EdsAppShell's.
 */
import * as React from "react";
import { EdsAppShell } from "./AppShell";
import { EdsSidebar, type EdsSidebarItem } from "./Sidebar";
import { EdsTopbar } from "./Topbar";
import { EdsProductLauncher, type EdsLauncherProduct } from "./ProductLauncher";

export interface EdsManagedShellProps {
  sidebarItems: readonly EdsSidebarItem[];
  launcherProducts: readonly EdsLauncherProduct[];
  activeItemId?: string;
  onNavigate?: (item: EdsSidebarItem) => void;
  onSearchTrigger?: () => void;
  onLauncherSelect?: (product: EdsLauncherProduct) => void;
  accountSlot?: React.ReactNode;
  utilitySlot?: React.ReactNode;
  evidenceRail?: React.ReactNode;
  workspaceLabel?: string;
  collapsedByDefault?: boolean;
  hideSidebarOnNarrow?: boolean;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}

export function EdsManagedShell({
  sidebarItems,
  launcherProducts,
  activeItemId,
  onNavigate,
  onSearchTrigger,
  onLauncherSelect,
  accountSlot,
  utilitySlot,
  evidenceRail,
  workspaceLabel,
  collapsedByDefault = false,
  hideSidebarOnNarrow = false,
  children,
  className,
  id,
}: EdsManagedShellProps) {
  const [collapsed, setCollapsed] = React.useState(collapsedByDefault);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [launcherOpen, setLauncherOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);

  return (
    <EdsAppShell
      className={collapsed ? "eds-appshell--collapsed" : className}
      id={id}
      workspaceLabel={workspaceLabel}
      evidenceRail={evidenceRail}
      sidebar={
        <EdsSidebar
          items={sidebarItems}
          activeItemId={activeItemId}
          collapsed={collapsed}
          onNavigate={onNavigate}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          variant="inline"
          hiddenOnNarrow={hideSidebarOnNarrow}
        />
      }
      topbar={
        <EdsTopbar
          onMenu={() => setDrawerOpen(true)}
          onSearchTrigger={onSearchTrigger}
          onLauncher={() => setLauncherOpen(true)}
          launcherOpen={launcherOpen}
          utilitySlot={utilitySlot}
          accountSlot={accountSlot}
          menuButtonRef={menuButtonRef}
        />
      }
      drawer={
        <EdsSidebar
          items={sidebarItems}
          activeItemId={activeItemId}
          collapsed={false}
          onNavigate={(item) => {
            onNavigate?.(item);
            closeDrawer();
          }}
          onToggleCollapse={closeDrawer}
          variant="drawer"
          open={drawerOpen}
          onClose={closeDrawer}
        />
      }
      overlays={
        <EdsProductLauncher
          open={launcherOpen}
          products={launcherProducts}
          onClose={() => setLauncherOpen(false)}
          onSelect={(product) => {
            onLauncherSelect?.(product);
            setLauncherOpen(false);
          }}
        />
      }
    >
      {children}
    </EdsAppShell>
  );
}
