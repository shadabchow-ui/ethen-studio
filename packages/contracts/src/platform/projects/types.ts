export type PlatformSurfaceStatus =
  | "mock-local"
  | "private-alpha"
  | "preview"
  | "placeholder"
  | "setup-required";

export interface PlatformSurfaceCard {
  id: string;
  label: string;
  href: string;
  summary: string;
  description: string;
  status: PlatformSurfaceStatus;
  metric?: string;
}

export interface PlatformProjectSnapshot {
  projectId: string;
  projectName: string;
  sessionCount: number;
  artifactCount: number;
  agentCount: number;
  messageCount: number;
  creditSpend: number;
}
