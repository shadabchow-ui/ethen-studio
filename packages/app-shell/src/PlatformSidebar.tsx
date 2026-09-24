"use client";

import { Sidebar } from "./Sidebar";
import type { NavSection } from "@ethen/navigation";
import type { AgentSidebarSection } from "@ethen/contracts/agents/types";

export interface PlatformSidebarProps {
  className?: string;
  currentSessionId?: string;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenProfile?: () => void;
  onCloseProfile?: () => void;
  profileOpen?: boolean;
  agentSidebarSections?: AgentSidebarSection[];
  onSectionItemClick?: (action: string, itemId: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  navSections?: NavSection[];
  hideRecentSessions?: boolean;
  widthPx?: number;
  /** When false, ConsoleShell owns the aside frame and 256/56 width. */
  framed?: boolean;
}

/**
 * Presentational platform sidebar. AppShell supplies every prop; this
 * component owns no navigation or persistence state.
 */
export function PlatformSidebar({ framed = false, ...props }: PlatformSidebarProps) {
  return <Sidebar framed={framed} {...props} />;
}
