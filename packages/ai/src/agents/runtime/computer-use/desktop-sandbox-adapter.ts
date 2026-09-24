// Desktop sandbox adapter placeholder — returns unavailable until a real
// virtual desktop runtime (Xvfb/noVNC/WebRTC/container/VM) is configured.
// No real processes, ports, dependencies, credentials, env vars, vendor
// names, or network calls are used here. This file is the seam where a
// future virtual desktop runtime would be wired in without altering the
// session-manager, action executor, or policy engine.
//
// Every capability reports unavailable/not_configured.
// Every operation fails closed. No fake frames, screenshots, streams,
// terminal output, file access, clipboard content, or costs are produced.

// ── Capability Model ───────────────────────────────────────────────────────

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
  /** Human-readable reason for the overall capability state. */
  reason: string;
}

// ── Session Mode ───────────────────────────────────────────────────────────

export type DesktopSessionMode = "available" | "unavailable" | "not_configured";

// ── Session Lifecycle States ───────────────────────────────────────────────

export type DesktopSessionLifecycle =
  | "created"
  | "scoping"
  | "starting"
  | "active"
  | "paused"
  | "approval_needed"
  | "takeover"
  | "completing"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled"
  | "timed_out";

// ── Desktop Session Contract ───────────────────────────────────────────────

export interface DesktopSession {
  runId: string;
  mode: DesktopSessionMode;
  currentLifecycle: DesktopSessionLifecycle;
  capabilities: DesktopCapabilityReport;

  // Session lifecycle
  start(): Promise<{ success: boolean; error?: string }>;
  stop(): Promise<{ success: boolean; error?: string }>;
  status(): { lifecycle: DesktopSessionLifecycle; reason: string };

  // Capability introspection
  getCapabilityReport(): DesktopCapabilityReport;

  // Frame / screenshot
  screenshot(): Promise<{
    success: boolean;
    imageUri?: string;
    width?: number;
    height?: number;
    error?: string;
  }>;

  // Input actions
  click(x: number, y: number): Promise<{ success: boolean; error?: string }>;
  doubleClick(x: number, y: number): Promise<{ success: boolean; error?: string }>;
  type(text: string): Promise<{ success: boolean; error?: string }>;
  pressKey(keys: string[]): Promise<{ success: boolean; error?: string }>;
  scroll(direction: "up" | "down" | "left" | "right", amount: number): Promise<{ success: boolean; error?: string }>;
  drag(from: [number, number], to: [number, number]): Promise<{ success: boolean; error?: string }>;
  wait(ms: number): Promise<{ success: boolean; error?: string }>;

  // Cleanup
  cleanup(): Promise<{ success: boolean; error?: string }>;

  // Unavailable reason — surfaced to callers so they can explain to the user
  // why the desktop sandbox is not available without guessing.
  getUnavailableReason(): string;
}

// ── Unavailable Implementation ─────────────────────────────────────────────

export const DESKTOP_SANDBOX_UNAVAILABLE_REASON =
  "Virtual desktop sandbox is not configured. A real desktop runtime (container/VM with virtual display) is required for desktop sessions." as const;

function unavailableCapabilityReport(): DesktopCapabilityReport {
  return {
    stream: "not_configured",
    screenshot: "not_configured",
    input: "not_configured",
    terminal: "not_configured",
    file_access: "not_configured",
    clipboard: "not_configured",
    reason: DESKTOP_SANDBOX_UNAVAILABLE_REASON,
  };
}

/**
 * Creates a DesktopSession that reports every capability as unavailable and
 * fails closed on every operation. No real processes are started, no ports
 * are bound, and no external dependencies are required.
 *
 * When a real virtual desktop runtime is added later, a replacement factory
 * (e.g. `createLiveDesktopSession`) would:
 *  - acquire a container/VM
 *  - launch Xvfb, window manager, browser, terminal, file tools
 *  - return a DesktopSession with mode="available" and capability reports
 *    reflecting which services are actually running
 *  - serve a noVNC/WebRTC stream for the UI viewport
 */
export function createUnavailableDesktopSession(
  runId: string,
): DesktopSession {
  return {
    runId,
    mode: "not_configured",
    currentLifecycle: "created",
    capabilities: unavailableCapabilityReport(),

    async start() {
      return { success: false, error: DESKTOP_SANDBOX_UNAVAILABLE_REASON };
    },

    async stop() {
      return { success: false, error: DESKTOP_SANDBOX_UNAVAILABLE_REASON };
    },

    status() {
      return {
        lifecycle: "created",
        reason: DESKTOP_SANDBOX_UNAVAILABLE_REASON,
      };
    },

    getCapabilityReport() {
      return unavailableCapabilityReport();
    },

    async screenshot() {
      return { success: false, error: "screenshot unavailable — desktop sandbox not configured" };
    },

    async click(_x: number, _y: number) {
      return { success: false, error: "input unavailable — desktop sandbox not configured" };
    },

    async doubleClick(_x: number, _y: number) {
      return { success: false, error: "input unavailable — desktop sandbox not configured" };
    },

    async type(_text: string) {
      return { success: false, error: "input unavailable — desktop sandbox not configured" };
    },

    async pressKey(_keys: string[]) {
      return { success: false, error: "input unavailable — desktop sandbox not configured" };
    },

    async scroll(_direction: "up" | "down" | "left" | "right", _amount: number) {
      return { success: false, error: "input unavailable — desktop sandbox not configured" };
    },

    async drag(_from: [number, number], _to: [number, number]) {
      return { success: false, error: "input unavailable — desktop sandbox not configured" };
    },

    async wait(_ms: number) {
      return { success: false, error: "desktop sandbox not configured" };
    },

    async cleanup() {
      return { success: true };
    },

    getUnavailableReason() {
      return DESKTOP_SANDBOX_UNAVAILABLE_REASON;
    },
  };
}

/**
 * Feature gate: returns true only when a desktop sandbox provider is
 * configured and available. Always returns false until a real runtime
 * is implemented. Callers should check this before attempting to start
 * or interact with a desktop session.
 */
export function isDesktopSandboxAvailable(): boolean {
  return false;
}

/**
 * Returns the current desktop sandbox provider status for reporting.
 * Always "not_configured" until a provider is wired.
 */
export function getDesktopSandboxProviderStatus(): {
  configured: boolean;
  provider: "none";
  reason: string;
} {
  return {
    configured: false,
    provider: "none",
    reason: DESKTOP_SANDBOX_UNAVAILABLE_REASON,
  };
}
