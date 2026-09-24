export type ComputerUseRunStatus =
  | "idle"
  | "scoping"
  | "starting"
  | "running"
  | "paused"
  | "approval_needed"
  | "takeover"
  | "blocked"
  | "recovering"
  | "failed"
  | "complete"
  | "cancelled"
  | "timed_out";

export type ComputerUseMode =
  | "browser"
  | "desktop"
  | "local-browser"
  | "remote-browser"
  | "local-desktop";

/**
 * Desktop sandbox session mode — whether a real virtual desktop runtime
 * is available, unavailable, or not yet configured. Always returns
 * "not_configured" or "unavailable" until a real runtime is implemented.
 */
export type DesktopSessionMode = "available" | "unavailable" | "not_configured";

export type DesktopCapability =
  | "stream"
  | "screenshot"
  | "input"
  | "terminal"
  | "file_access"
  | "clipboard";

export type DesktopCapabilityStatus =
  | "available"
  | "unavailable"
  | "not_configured";

export interface DesktopCapabilityReport {
  stream: DesktopCapabilityStatus;
  screenshot: DesktopCapabilityStatus;
  input: DesktopCapabilityStatus;
  terminal: DesktopCapabilityStatus;
  file_access: DesktopCapabilityStatus;
  clipboard: DesktopCapabilityStatus;
  reason: string;
}

/**
 * Distinguishes whether a session/observation was produced by a real
 * Playwright-backed browser, an explicit simulation (mock), or is
 * unavailable because the real browser failed to launch. Callers must
 * use this field rather than inferring/guessing the mode — simulation
 * must never silently present itself as live.
 */
export type BrowserSessionMode = "simulation" | "live_browser" | "unavailable";

/**
 * The full set of execution environment states the UI displays.
 * Extends BrowserSessionMode with the local desktop companion's
 * handshake statuses and the hosted-browser adapter state.
 */
export type EnvironmentMode =
  | BrowserSessionMode
  | "local_desktop_unavailable"
  | "local_desktop_permission_denied"
  | "local_desktop_disconnected"
  | "hosted_browser_unavailable";

export type ComputerUseProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "playwright"
  | "stagehand"
  | "browser-use"
  | "hybrid";

export type CredentialMode =
  | "none"
  | "takeover"
  | "vault-proxy"
  | "manual";

export type FileSystemScope =
  | "none"
  | "workspace-read"
  | "workspace-read-write";

export type NetworkMode =
  | "none"
  | "allowlist"
  | "open-with-approval";

export type DataRetention =
  | "session-only"
  | "standard"
  | "enterprise";

export type PolicyAccessMode =
  | "observe-only"
  | "guided-browser"
  | "autonomous-browser"
  | "qa-browser";

export type DomainPolicyMode =
  | "restricted"
  | "open_web"
  | "custom";

export const POLICY_TEMPLATE_NAMES: PolicyAccessMode[] = [
  "observe-only",
  "guided-browser",
  "autonomous-browser",
  "qa-browser",
];

export interface PermissionScope {
  accessMode: PolicyAccessMode;
  domainPolicyMode: DomainPolicyMode;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedActions: string[];
  approvalRequiredActions: string[];
  blockedActions: string[];
  credentialMode: CredentialMode;
  fileSystemScope: FileSystemScope;
  networkMode: NetworkMode;
  dataRetention: DataRetention;
  maxSteps: number;
  maxRuntimeMinutes: number;
  maxCostUsd?: number;
}

export interface TaskBrief {
  goal: string;
  environment: string;
  allowedDomains: string[];
  allowedActions: string[];
  requiresApprovalFor: string[];
  maxSteps: number;
}

export interface SandboxSession {
  sandboxId: string;
  mode: ComputerUseMode;
  status: "creating" | "ready" | "error" | "destroyed";
  viewport: { width: number; height: number; scale: number };
  url?: string;
  createdAt: string;
  /** Whether this sandbox is backed by a real Playwright browser, an explicit simulation, or unavailable. */
  browserSessionMode?: BrowserSessionMode;
  /** Whether a virtual desktop or local desktop session is resolved for this sandbox. */
  desktopSessionMode?: DesktopSessionMode;
}

export interface CostEstimate {
  estimatedUsd?: number;
  tokensUsed?: number;
  stepsUsed: number;
}

export interface ComputerUseRun {
  id: string;
  userId: string;
  /** Existing organization label retained for compatibility with legacy records. */
  orgId?: string;
  /** Canonical tenancy key for all newly-created durable Computer Use runs. */
  projectId?: string;
  title: string;
  mode: ComputerUseMode;
  provider: ComputerUseProvider;
  status: ComputerUseRunStatus;
  task: string;
  taskBrief: TaskBrief;
  permissionScope: PermissionScope;
  sandbox: SandboxSession;
  currentStepId?: string;
  stepCount: number;
  maxSteps: number;
  startedAt: string;
  completedAt?: string;
  costEstimate?: CostEstimate;
  summary?: string;
  resultStatus?: "success" | "partial" | "failed" | "blocked";
}

export type TimelineEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "sandbox.started"
  | "sandbox.ready"
  | "observation.captured"
  | "agent.thought_summary"
  | "action.proposed"
  | "policy.allowed"
  | "policy.approval_required"
  | "policy.blocked"
  | "policy.suspicious"
  | "policy.file_access_blocked"
  | "policy.local_network_blocked"
  | "policy.unknown_redirect_blocked"
  | "policy.exfiltration_blocked"
  | "policy.injection_pattern_detected"
  | "approval.requested"
  | "approval.approved"
  | "approval.denied"
  | "action.executed"
  | "action.failed"
  | "verification.passed"
  | "verification.failed"
  | "verification.unknown"
  | "recovery.started"
  | "user.paused"
  | "user.takeover.started"
  | "user.takeover.ended"
  | "artifact.created"
  | "run.aborted"
  | "planner.provider.selected"
  | "planner.request.started"
  | "planner.response.received"
  | "planner.response.parse_failed"
  | "planner.decision.proposed"
  | "planner.provider.error"
  | "policy.evaluated"
  | "action.execution.started"
  | "action.execution.completed"
  | "action.execution.failed"
  | "observation.capture.started"
  | "observation.capture.completed"
  | "observation.capture.failed"
  | "loop.iteration.continued"
  | "loop.iteration.stopped";

export type EventActor =
  | "user"
  | "agent"
  | "runtime"
  | "policy"
  | "system";

export interface ComputerUseScreenshot {
  id: string;
  runId: string;
  stepId?: string;
  capturedAt: string;
  originalWidth: number;
  originalHeight: number;
  sentWidth: number;
  sentHeight: number;
  scaleX: number;
  scaleY: number;
  devicePixelRatio: number;
  imageUri: string;
  hash: string;
  label?: string;
}

export type ComputerActionType =
  | "screenshot"
  | "click"
  | "double_click"
  | "drag"
  | "scroll"
  | "type"
  | "key"
  | "wait"
  | "navigate"
  | "pressKey"
  | "inspectDom"
  | "dom_click"
  | "dom_type"
  | "complete"
  | "fail"
  | "extractText"
  | "extractLinks"
  | "extractHeadings"
  | "extractTable"
  // Desktop-class action categories (safety-gated — no real execution)
  | "desktop_screenshot"
  | "desktop_click"
  | "desktop_type"
  | "desktop_key"
  | "desktop_scroll"
  | "desktop_app_switch"
  | "desktop_app_open"
  | "desktop_clipboard_read"
  | "desktop_clipboard_write"
  | "desktop_file_download"
  | "desktop_file_upload"
  | "desktop_file_access"
  | "desktop_terminal_exec"
  | "desktop_credential_field"
  | "desktop_os_settings"
  | "desktop_system_dialog";

/** Desktop action categories prefixed with "desktop_" — must fail closed by default. */
export const DESKTOP_ACTION_PREFIX = "desktop_";

export function isDesktopActionType(type: string): boolean {
  return type.startsWith(DESKTOP_ACTION_PREFIX);
}

/** Actions that must never execute without explicit desktop policy and approval support. */
export const DESKTOP_CRITICAL_RISK_ACTIONS: ComputerActionType[] = [
  "desktop_terminal_exec",
  "desktop_file_access",
  "desktop_credential_field",
  "desktop_clipboard_read",
  "desktop_clipboard_write",
  "desktop_file_download",
  "desktop_file_upload",
  "desktop_os_settings",
  "desktop_app_switch",
];

export interface ComputerAction {
  type: ComputerActionType;
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  from?: [number, number];
  to?: [number, number];
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  text?: string;
  keys?: string[];
  ms?: number;
  url?: string;
  ref?: string;
  selector?: string;
  targetLabel?: string;
  sensitive?: boolean;
  reason?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  beforeScreenshotId?: string;
  afterScreenshotId?: string;
  verification?: VerificationResult;
  /** Which session mode actually produced this result/evidence. */
  browserSessionMode?: BrowserSessionMode;
  /**
   * Bounded, untrusted page-derived data for read/extract actions
   * (inspectDom/extractText/extractLinks/extractHeadings/extractTable).
   * Always treated as untrusted page content downstream — never executable
   * instructions. Kept small/compact for use as planner observation context.
   */
  data?: {
    elements?: Array<{ tag: string; text?: string; attributes?: Record<string, string> }>;
    text?: string;
    links?: Array<{ href: string; text: string }>;
    headings?: Array<{ level: number; text: string }>;
    table?: string[][];
  };
}

export type VerificationStatus = "passed" | "failed" | "unknown";

export interface VerificationResult {
  status: VerificationStatus;
  passed: boolean;
  confidence: "high" | "medium" | "low";
  summary: string;
  evidence?: string;
  beforeObservationId?: string;
  afterObservationId?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  retryable?: boolean;
  retryRecommendation?: string;
  failureCode?: string;
  failureReason?: string;
}

export interface PolicyDecision {
  outcome: "allow" | "approval_required" | "block";
  reason: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface ComputerUseStep {
  id: string;
  runId: string;
  index: number;
  status: "proposed" | "approved" | "executed" | "verified" | "failed" | "blocked";
  action: ComputerAction;
  result?: ActionResult;
  policyDecision?: PolicyDecision;
  beforeScreenshotId?: string;
  afterScreenshotId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ComputerUseApproval {
  id: string;
  runId: string;
  stepId: string;
  requestedAt: string;
  resolvedAt?: string;
  requestedBy: "agent" | "runtime" | "policy";
  resolvedBy?: string;
  decision?: "approved" | "denied" | "edited" | "expired";
  action: ComputerAction;
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
  screenshotBeforeId?: string;
  redactionApplied: boolean;
  payloadIdentity?: string;
  /** Canonical domain of the target URL at approval time (for display/audit). */
  targetDomain?: string;
  /** Human-readable preview of the action payload (redacted for sensitive fields). */
  payloadPreview?: string;
  /** Deterministic SHA-256 hash of the canonical action identity. Re-checked on resolution. */
  payloadHash?: string;
  /** ISO timestamp after which this approval is considered expired. */
  expiresAt?: string;
  /** Reason supplied when the approval was denied (optional). */
  denialReason?: string;
}

/** Sensitive action categories that must be approval-gated or takeover-gated. */
export type SensitiveActionCategory =
  | "form_submit"
  | "message_send_post"
  | "delete_destructive_change"
  | "upload"
  | "download"
  | "clipboard_access"
  | "credential_entry_use"
  | "payment_checkout"
  | "captcha_mfa_login_blocker"
  | "account_change"
  | "external_navigation";

export const SENSITIVE_ACTION_CATEGORIES: SensitiveActionCategory[] = [
  "form_submit",
  "message_send_post",
  "delete_destructive_change",
  "upload",
  "download",
  "clipboard_access",
  "credential_entry_use",
  "payment_checkout",
  "captcha_mfa_login_blocker",
  "account_change",
  "external_navigation",
];

export interface ComputerUseArtifact {
  id: string;
  runId: string;
  type: "screenshot" | "report" | "replay" | "trace" | "download" | "log";
  title: string;
  uri: string;
  contentType: string;
  sizeBytes: number;
  hash: string;
  redacted: boolean;
  createdAt: string;
}

export interface TextExtractionResult {
  text: string;
  selector?: string;
  trustLevel: "untrusted_page";
}

export interface LinkExtractionResult {
  links: Array<{ href: string; text: string }>;
  trustLevel: "untrusted_page";
}

export interface HeadingExtractionResult {
  headings: Array<{ level: number; text: string }>;
  trustLevel: "untrusted_page";
}

export interface TableExtractionResult {
  table: string[][];
  selector?: string;
  trustLevel: "untrusted_page";
}

export type ObservationTrustLevel =
  | "trusted_system"
  | "user_provided"
  | "untrusted_page"
  | "trusted_connector";

/**
 * Flags that mark which observation sub-layers are available in the current
 * session. Every field defaults to false; callers set true only when the
 * provider actually returns usable data for that layer.
 */
export interface ObservationAvailability {
  screenshot: boolean;
  url: boolean;
  title: boolean;
  dom: boolean;
  /** Always false until Playwright accessibility snapshot support is wired. */
  accessibility: boolean;
  viewport: boolean;
  /** Bounding boxes for interactive elements; always false for now. */
  boundingBoxes: boolean;
}

/**
 * Lightweight DOM/accessibility element excerpt. Bounded — never dump the
 * full page DOM.
 */
export interface ObservationElementExcerpt {
  tag: string;
  text?: string;
  role?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Snapshot-scoped interactive element ref with bounding box and display
 * metadata. Each ref is valid only for one observation snapshot and must
 * be rederived after navigation or significant DOM-changing actions.
 */
export interface ObservationElementRef {
  /** Stable within the snapshot. Format: `a11y-N` or `el-N`. */
  ref: string;
  /** Observation/snapshot ID that produced this ref. */
  snapshotId: string;
  tagName: string;
  role?: string;
  name?: string;
  label?: string;
  text?: string;
  selector?: string;
  href?: string;
  inputType?: string;
  disabled?: boolean;
  visible?: boolean;
  clickable?: boolean;
  editable?: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

/**
 * Coordinate metadata that relates screenshot/model coordinates to actual
 * Playwright viewport coordinates.
 */
export interface ObservationCoordinateMetadata {
  viewportWidth: number;
  viewportHeight: number;
  screenshotOriginalWidth: number;
  screenshotOriginalHeight: number;
  sentWidth: number;
  sentHeight: number;
  scaleX: number;
  scaleY: number;
  devicePixelRatio: number;
}

/**
 * Provider/source identity for this observation — which tool, adapter, or
 * session type produced the data.
 */
export interface ObservationSource {
  /** e.g. "playwright", "mock", "hosted-browser", "desktop-sandbox" */
  provider: string;
  /** session mode label: "live_browser" | "simulation" | "unavailable" */
  sessionMode: BrowserSessionMode;
  /** Map of sub-layer names to whether the provider was able to populate them. */
  capabilities: ObservationAvailability;
  /** Human-readable reason if something is unavailable (e.g. "Playwright accessibility snapshot is not yet wired.") */
  unavailableReason?: string;
}

export interface SuspiciousContentResult {
  detected: boolean;
  patterns: string[];
  source: "page_text" | "dom" | "screenshot_ocr" | "tool_output" | "action_proposal";
  severity: "low" | "medium" | "high" | "critical";
  evidence: string;
}

/**
 * Blocker flags detected from page content/state. Each field is true when
 * the blocker was detected, false when explicitly absent, and null when the
 * data required to make the determination is unavailable.
 */
export interface ObservationBlockerFlags {
  /** Login/password wall detected on current page. */
  login: boolean | null;
  /** Multi-factor authentication challenge detected. */
  mfa: boolean | null;
  /** CAPTCHA challenge detected. */
  captcha: boolean | null;
  /** Payment/checkout/paywall gate detected. */
  payment: boolean | null;
  /** Cookie consent banner detected. */
  cookieBanner: boolean | null;
  /** Modal dialog / popup overlay detected. */
  modal: boolean | null;
  /** File picker dialog detected. */
  filePicker: boolean | null;
}

/**
 * Sensitive content flags detected from page DOM. Each field is true when
 * the sensitive content was detected, false when explicitly absent, and
 * null when the data required to make the determination is unavailable.
 */
export interface ObservationSensitiveFlags {
  /** Password input fields detected on page. */
  passwordFieldsDetected: boolean | null;
  /** Payment/card number fields detected on page. */
  paymentFieldsDetected: boolean | null;
  /** Personally identifiable information likely visible. */
  piiLikelyVisible: boolean | null;
  /** Redaction of screenshot content recommended before sharing. */
  redactionRecommended: boolean | null;
}

/**
 * Interactive element categories extracted from the current page DOM.
 * Each array is bounded — never dump the full page contents.
 */
export interface ObservationElementCategories {
  forms: Array<{
    action?: string;
    method?: string;
    fieldCount: number;
    hasPassword: boolean;
    hasSubmit: boolean;
  }>;
  links: Array<{ href: string; text: string }>;
  buttons: Array<{ text: string; ref?: string }>;
  headings: Array<{ level: number; text: string }>;
  tables: Array<{ rowCount: number; colCount: number; firstRow: string[] }>;
  iframes: Array<{ src?: string; label: string }> | null;
  shadowDomDetected: boolean | null;
}

/**
 * Result produced by the ObservationBuilder — a normalized observation
 * object for browser-agent planning, verification, replay, approvals, and
 * later native visual providers.
 */
export interface ObservationBuilderResult {
  runId: string;
  stepId?: string;
  stepIndex?: number;
  capturedAt: string;
  currentUrl: string | null;
  pageTitle: string | null;
  browserSessionMode: BrowserSessionMode | null;
  viewport: { width: number; height: number; deviceScaleFactor?: number };

  /** Screenshot metadata when available. */
  screenshot?: {
    id: string;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    devicePixelRatio: number;
    label?: string;
  };

  /** Bounded visible text summary from the page (max ~1500 chars). */
  visibleTextSummary: string | null;
  /** Bounded DOM summary labels (tag + short text). */
  domSummary: string[] | null;

  /** Categorized interactive elements from page DOM. */
  elementCategories: ObservationElementCategories;
  /** Per-element bounding boxes when discoverable. Null when unavailable. */
  elementBoundingBoxes: ObservationElementExcerpt[] | null;
  /** Full interactive element ref map with bounding boxes. Null when unavailable. */
  elementRefs: ObservationElementRef[] | null;
  /** Coordinate metadata for mapping screenshot coordinates to viewport. Null when unavailable. */
  coordinateMetadata: ObservationCoordinateMetadata | null;

  /** Accessibility snapshot text when available. Null when unavailable. */
  accessibilitySnapshotText: string | null;
  /** Accessibility refs (role + name + bounds) when available. */
  accessibilityRefs: Array<{
    ref: string;
    role: string;
    name: string;
    bounds?: { x: number; y: number; width: number; height: number };
  }> | null;

  /** Console error summaries when capture is available. */
  consoleErrorSummary: string[] | null;
  /** Network failure summaries when capture is available. */
  networkFailureSummary: string[] | null;

  /** Blocker flags for known blocking patterns. */
  blockerFlags: ObservationBlockerFlags;
  /** Sensitive content flags. */
  sensitiveFlags: ObservationSensitiveFlags;

  /** Honest availability report — each layer true only when data is real. */
  availability: ObservationAvailability;
  /** Provider/source identity for this observation. */
  source: ObservationSource;
  /** Explanations for unavailable layers. */
  blockerHints: string[] | null;

  /** Trust labels for this observation's content sources. */
  trustLabels: {
    userInstruction: "trusted";
    pageContent: "untrusted";
    domContent: "untrusted";
    screenshotContent: "untrusted";
    toolOutput: "untrusted";
    modelOutput: "untrusted";
  };

  /** Overall confidence in this observation's completeness. */
  confidence: "high" | "medium" | "low";
}

export interface ComputerUseObservation {
  runId: string;
  stepId: string;
  timestamp: string;
  environment: "browser" | "desktop";
  url?: string;
  /** Page title from browser getState(); null when unavailable. */
  pageTitle?: string | null;
  screenshot?: ComputerUseScreenshot;
  viewport: { width: number; height: number; deviceScaleFactor?: number };
  visibleText?: string;
  networkState?: "idle" | "loading" | "unknown";
  /** Which kind of session produced this observation. */
  browserSessionMode?: BrowserSessionMode;
  /** Trust label for this observation's content source. */
  trustLevel?: ObservationTrustLevel;
  /**
   * Which observation layers are actually populated by the current provider.
   * Every field defaults to false; set true only when the provider returns
   * usable data for that layer. Never fabricate.
   */
  availability?: ObservationAvailability;
  /**
   * Where this observation data came from (provider, session mode, per-layer
   * capability flags, and human-readable reason for unavailable layers).
   */
  source?: ObservationSource;
  /**
   * Bounded DOM summary labels (tag names + short text). Null when
   * inspectDom/extractText has not executed or is unavailable.
   */
  domSummary?: string[] | null;
  /**
   * Bounded accessibility tree excerpt (role + name). Always null until
   * Playwright accessibility snapshot support is wired.
   */
  accessibilitySummary?: string[] | null;
  /**
   * Bounded bounding box summaries for observed interactive elements.
   * Always null until a provider returns coordinate data.
   */
  elementBoundingBoxes?: ObservationElementExcerpt[] | null;
  /**
   * Full element ref map with bounding boxes for the current observation
   * snapshot. Null until a live browser session populates it.
   */
  elementRefs?: ObservationElementRef[] | null;
  /**
   * Coordinate metadata for mapping screenshot/model coordinates to the
   * actual browser viewport. Null when unavailable.
   */
  coordinateMetadata?: ObservationCoordinateMetadata | null;
  /**
   * Overall confidence in this observation's completeness. "high" when
   * all expected layers are populated from a live browser; "low" when
   * simulation or unavailable; "medium" for partial capture.
   */
  confidence?: "high" | "medium" | "low";
}

export interface ComputerUseReplayEvent {
  id: string;
  runId: string;
  stepId?: string;
  type: TimelineEventType;
  timestamp: string;
  actor: EventActor;
  screenshotId?: string;
  action?: ComputerAction;
  result?: ActionResult;
  policyDecision?: PolicyDecision;
  step?: ComputerUseStep;
  metadata?: Record<string, unknown>;
}

export const TERMINAL_CU_RUN_STATUSES: ComputerUseRunStatus[] = [
  "complete",
  "failed",
  "cancelled",
  "timed_out",
];

export const ACTIVE_CU_RUN_STATUSES: ComputerUseRunStatus[] = [
  "running",
  "starting",
  "scoping",
  "approval_needed",
  "takeover",
  "blocked",
  "recovering",
];
