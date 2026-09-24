export type QaCheckStatus = "pass" | "fail" | "partial" | "blocked" | "skipped" | "info";

export type QaFindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type QaResultStatus = "success" | "partial" | "failed" | "blocked";

export interface QaCheck {
  id: string;
  name: string;
  description: string;
  status: QaCheckStatus;
  evidence?: string;
  details?: string;
}

export interface QaFinding {
  id: string;
  severity: QaFindingSeverity;
  title: string;
  description: string;
  evidence: string[];
  reproductionSteps?: string[];
  category?: string;
}

export interface QaScreenshotRef {
  id: string;
  label: string;
  capturedAt: string;
  mimeType: string;
}

export interface QaObservation {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  bodyTextPreview?: string;
  hasVisibleContent: boolean;
  consoleErrors: string[];
  interactiveControlCount: number;
  screenshotRefs: QaScreenshotRef[];
}

export interface QaResult {
  runId: string;
  sessionId: string;
  targetUrl: string;
  status: QaResultStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  observations: QaObservation[];
  checks: QaCheck[];
  findings: QaFinding[];
  limitations: string[];
}

export interface QaRunConfig {
  targetUrl: string;
  maxSteps: number;
  allowedDomains: string[];
  viewportWidth: number;
  viewportHeight: number;
}
