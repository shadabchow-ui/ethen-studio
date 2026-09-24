"use client";

/**
 * App-shell feature slots — U02-A closure.
 *
 * The shared shell owns chrome (sidebars, command palette, frames, panel
 * geometry). It does NOT own the product surfaces it frames: the artifact
 * panel, the agent workspace and inspector, the profile popover, the
 * assistant/help modals and the workspace factory registry all belong to the
 * hosting application.
 *
 * Before extraction the shell reached back into `@/components/*` for those,
 * which made every consumer of `@ethen/app-shell` depend on the root
 * monolith. The dependency is inverted here: the shell declares the contract,
 * the host registers implementations at boot, and the edge points
 * host -> package in both directions of the build graph.
 *
 * Rendering is unchanged. A slot that has not been registered renders
 * nothing, which is the same result the shell produced when a surface was
 * absent.
 */

import type { ComponentType, ReactNode } from "react";
import type { Agent } from "@ethen/contracts/agents/types";
import type { AgentInspectorSection } from "@ethen/contracts/agents/agent-inspector-config";

export type SerializedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export interface ArtifactPanelSlotProps {
  sessionId: string | null;
  agent?: Agent | null;
  onClose?: () => void;
  className?: string;
}

export interface AgentWorkspaceSlotProps {
  agent: Agent;
  sessionId: string;
  className?: string;
  initialMessages?: SerializedMessage[];
  selectedModelId?: string;
  onOpenMobileSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  onToggleArtifactPanel?: () => void;
}

export interface AgentInspectorRailSlotProps {
  agent: Agent;
  sessionId: string;
  prefill?: string;
  className?: string;
  onClose?: () => void;
  overrideSections?: Partial<Record<AgentInspectorSection, ReactNode>>;
  focusSection?: AgentInspectorSection | null;
  onFocusHandled?: () => void;
}

export interface ProfilePopoverSlotProps {
  open: boolean;
  onClose: () => void;
  onOpenHelp?: () => void;
  anchorEl?: HTMLElement | null;
}

export interface AssistantModalSlotProps {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export interface KeyboardShortcutsModalSlotProps {
  open: boolean;
  onClose: () => void;
}

export interface WorkspaceFrameSlotProps {
  title: string;
  composer?: ReactNode;
  children?: ReactNode;
}

export interface WorkspaceRenderProps {
  agent: Agent;
  sessionId: string;
  className?: string;
  initialMessages?: SerializedMessage[];
  onOpenMobileSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  onToggleArtifactPanel?: () => void;
  onInspectorContentChange?: (
    content: Partial<Record<AgentInspectorSection, ReactNode>> | undefined,
  ) => void;
  onFocusInspectorSection?: (section: AgentInspectorSection) => void;
  onInspectorOpenChange?: (open: boolean) => void;
}

export type WorkspaceFactory = (props: WorkspaceRenderProps) => ReactNode;

/** The prefill event the shell dispatches; the composer listens for it. */
export const COMPOSER_PREFILL_EVENT = "ethen:composer-prefill";

export interface AppShellSlots {
  ArtifactPanel: ComponentType<ArtifactPanelSlotProps>;
  AgentWorkspace: ComponentType<AgentWorkspaceSlotProps>;
  AgentInspectorRail: ComponentType<AgentInspectorRailSlotProps>;
  ProfilePopover: ComponentType<ProfilePopoverSlotProps>;
  WorkspaceFrame: ComponentType<WorkspaceFrameSlotProps>;
  loadAssistantModal: () => Promise<ComponentType<AssistantModalSlotProps>>;
  loadKeyboardShortcutsModal: () => Promise<
    ComponentType<KeyboardShortcutsModalSlotProps>
  >;
  resolveWorkspace: (agent: Agent) => WorkspaceFactory | null;
}

const registry: Partial<AppShellSlots> = {};

/**
 * Register the host application's implementations. Call once, at module
 * scope of a client entry that loads before any shell renders.
 */
export function registerAppShellSlots(slots: Partial<AppShellSlots>): void {
  Object.assign(registry, slots);
}

function Empty(): ReactNode {
  return null;
}

/** Fallback frame: renders children unwrapped when no host frame is registered. */
function PassthroughFrame({ children }: WorkspaceFrameSlotProps): ReactNode {
  return <>{children}</>;
}

export function getArtifactPanel(): ComponentType<ArtifactPanelSlotProps> {
  return registry.ArtifactPanel ?? (Empty as ComponentType<ArtifactPanelSlotProps>);
}

export function getAgentWorkspace(): ComponentType<AgentWorkspaceSlotProps> {
  return registry.AgentWorkspace ?? (Empty as ComponentType<AgentWorkspaceSlotProps>);
}

export function getAgentInspectorRail(): ComponentType<AgentInspectorRailSlotProps> {
  return (
    registry.AgentInspectorRail ??
    (Empty as ComponentType<AgentInspectorRailSlotProps>)
  );
}

export function getProfilePopover(): ComponentType<ProfilePopoverSlotProps> {
  return registry.ProfilePopover ?? (Empty as ComponentType<ProfilePopoverSlotProps>);
}

export function getWorkspaceFrame(): ComponentType<WorkspaceFrameSlotProps> {
  return registry.WorkspaceFrame ?? PassthroughFrame;
}

export function loadAssistantModal(): Promise<ComponentType<AssistantModalSlotProps>> {
  return (
    registry.loadAssistantModal?.() ??
    Promise.resolve(Empty as ComponentType<AssistantModalSlotProps>)
  );
}

export function loadKeyboardShortcutsModal(): Promise<
  ComponentType<KeyboardShortcutsModalSlotProps>
> {
  return (
    registry.loadKeyboardShortcutsModal?.() ??
    Promise.resolve(Empty as ComponentType<KeyboardShortcutsModalSlotProps>)
  );
}

export function resolveWorkspace(agent: Agent): WorkspaceFactory | null {
  return registry.resolveWorkspace?.(agent) ?? null;
}
