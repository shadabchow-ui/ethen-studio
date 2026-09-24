// Local Desktop Companion Contract + Unavailable Placeholder
// ===========================================================
//
// This file defines the protocol contract for a future local desktop
// companion (macOS/Windows accessibility, screen recording, input
// automation, per-app permissions, clipboard, file access, terminal,
// and emergency stop). It also provides an unavailable placeholder
// adapter that always fails closed — no native calls, no daemon, no
// localhost service, no ports, no env vars, no fake connected state.
//
// The contract is split into three layers:
//   1.  Handshake / connection status — what the companion reports.
//   2.  Permission status model — which local capabilities are granted.
//   3.  Future action protocol shape — action types reserved for local
//       desktop control (blocked until the companion is implemented).
//
// When a real local companion is added later, the callers (session
// manager, action executor, UI) will switch on these types without
// changing their existing simulation / live_browser / hosted-browser
// paths. Until then every local desktop operation returns unavailable.

import type { BrowserSession } from "./actions";
import type { BrowserSessionMode } from "./types";

// ── 1. Companion Handshake / Connection Status ──────────────────────

export type LocalCompanionStatus =
  | "disconnected"
  | "unavailable"
  | "permission_not_granted"
  | "error";

/**
 * Connected is only included as a *type* placeholder — the unavailable
 * adapter never returns it and no fake connected state is ever produced.
 * A real implementation would add it here once the native bridge exists.
 */
export type LocalCompanionStatusWithPlaceholder =
  | LocalCompanionStatus
  // Reserved for future real implementation — never returned today:
  // | "connected";

export interface LocalCompanionHandshake {
  status: LocalCompanionStatus;
  /** Human-readable reason, e.g. "no native companion app installed" */
  reason: string;
  /** When the status was last checked (ISO-8601). */
  checkedAt: string;
  /**
   * Whether the companion app binary/process was ever detected on this
   * machine. Always false in the placeholder — the placeholder makes
   * no system calls.
   */
  appDetected: false;
  /**
   * OS reported by the companion (e.g. "macOS 15.1", "Windows 11").
   * Always "unknown" in the placeholder.
   */
  osReported: "unknown";
}

export const LOCAL_COMPANION_UNAVAILABLE_REASON =
  "local desktop companion not implemented — no native app, daemon, or localhost service is installed";

export const LOCAL_COMPANION_UNAVAILABLE_HANDSHAKE: LocalCompanionHandshake = {
  status: "unavailable",
  reason: LOCAL_COMPANION_UNAVAILABLE_REASON,
  checkedAt: new Date().toISOString(),
  appDetected: false,
  osReported: "unknown",
};

export function getLocalCompanionHandshake(): LocalCompanionHandshake {
  // No system calls, no fs checks, no process enumeration, no IPC.
  // Always returns the unavailable placeholder handshake.
  return { ...LOCAL_COMPANION_UNAVAILABLE_HANDSHAKE, checkedAt: new Date().toISOString() };
}

// ── 2. Permission Status Model ─────────────────────────────────────

export type LocalPermissionKey =
  | "screen_recording"
  | "accessibility"
  | "input_automation"
  | "clipboard"
  | "file_access"
  | "terminal_shell"
  | "network_localhost_trust"
  | "emergency_stop";

export type LocalPermissionState =
  | "not_requested"
  | "denied"
  | "granted";

export interface LocalPermissionStatus {
  key: LocalPermissionKey;
  state: LocalPermissionState;
  /** App-scope, per-app bundle IDs or paths. Empty means global. */
  scope: string[];
  /** Whether the OS-level permission toggle is on. */
  osGranted: boolean;
  /** Whether the user has explicitly allowed this permission in the companion. */
  userConsented: boolean;
}

export const LOCAL_DESKTOP_PERMISSION_KEYS: LocalPermissionKey[] = [
  "screen_recording",
  "accessibility",
  "input_automation",
  "clipboard",
  "file_access",
  "terminal_shell",
  "network_localhost_trust",
  "emergency_stop",
];

/**
 * Returns the permission status for every local permission key.
 * In the placeholder, every permission is absent / not requested.
 * When a real companion is implemented, this would query the
 * companion process over a secured local IPC channel.
 */
export function getLocalPermissionStatuses(): LocalPermissionStatus[] {
  return LOCAL_DESKTOP_PERMISSION_KEYS.map((key) => ({
    key,
    state: "not_requested" as LocalPermissionState,
    scope: [],
    osGranted: false,
    userConsented: false,
  }));
}

export function buildLocalPermissionSummary(): {
  granted: LocalPermissionKey[];
  denied: LocalPermissionKey[];
  missing: LocalPermissionKey[];
  anyGranted: boolean;
} {
  const statuses = getLocalPermissionStatuses();
  const granted = statuses.filter((p) => p.state === "granted").map((p) => p.key);
  const denied = statuses.filter((p) => p.state === "denied").map((p) => p.key);
  const missing = statuses.filter((p) => p.state === "not_requested").map((p) => p.key);
  return { granted, denied, missing, anyGranted: granted.length > 0 };
}

// ── 3. Future Local Desktop Action Protocol Shape ───────────────────

/**
 * Action types that would be available through a real local desktop
 * companion. Today every one of these is blocked / unavailable.
 */
export type LocalDesktopActionType =
  | "local_screenshot"
  | "local_click"
  | "local_type"
  | "local_key_press"
  | "local_scroll"
  | "local_wait"
  | "local_app_focus"
  | "local_app_open"
  | "local_clipboard_read"
  | "local_clipboard_write"
  | "local_file_read"
  | "local_file_write"
  | "local_terminal_exec"
  | "local_emergency_stop";

export const LOCAL_DESKTOP_ACTION_TYPES: LocalDesktopActionType[] = [
  "local_screenshot",
  "local_click",
  "local_type",
  "local_key_press",
  "local_scroll",
  "local_wait",
  "local_app_focus",
  "local_app_open",
  "local_clipboard_read",
  "local_clipboard_write",
  "local_file_read",
  "local_file_write",
  "local_terminal_exec",
  "local_emergency_stop",
];

/** Actions that write, send, or modify state — highest risk. */
export const HIGH_RISK_LOCAL_ACTIONS: Set<LocalDesktopActionType> = new Set([
  "local_file_write",
  "local_terminal_exec",
  "local_clipboard_write",
]);

/** Actions that read local data — medium risk. */
export const MEDIUM_RISK_LOCAL_ACTIONS: Set<LocalDesktopActionType> = new Set([
  "local_screenshot",
  "local_clipboard_read",
  "local_file_read",
]);

/** Observation-only local actions — lower risk. */
export const LOW_RISK_LOCAL_ACTIONS: Set<LocalDesktopActionType> = new Set([
  "local_wait",
]);

export type LocalDesktopRiskLevel = "low" | "medium" | "high";

export function getLocalDesktopActionRisk(
  actionType: LocalDesktopActionType,
): LocalDesktopRiskLevel {
  if (HIGH_RISK_LOCAL_ACTIONS.has(actionType)) return "high";
  if (MEDIUM_RISK_LOCAL_ACTIONS.has(actionType)) return "medium";
  return "low";
}

// ── 4. Unavailable Placeholder Adapter ──────────────────────────────

/**
 * Creates a BrowserSession compliant object that represents a
 * permanently unavailable local desktop companion. Every operation
 * fails closed — callers must never mistake this for a real session.
 *
 * No native calls. No daemon. No localhost service. No ports.
 * No env vars. No fake connected state. No credentials.
 */
export function createLocalDesktopSession(
  runId: string,
): BrowserSession {
  const viewport = { width: 0, height: 0 };

  return {
    runId,
    currentUrl: "",
    viewport,
    mode: "unavailable" as BrowserSessionMode,

    async navigate(_url: string) {
      return {
        success: false,
        url: "",
        error: LOCAL_COMPANION_UNAVAILABLE_REASON,
      };
    },

    async screenshot() {
      throw new Error(LOCAL_COMPANION_UNAVAILABLE_REASON);
    },

    async click(_x: number, _y: number) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async type(_text: string) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async scroll(_direction: string, _amount: number) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async wait(_ms: number) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async pressKey(_keys: string[]) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async inspectDom() {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async extractText(_selector?: string) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async extractLinks() {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async extractHeadings() {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    async extractTable(_selector?: string) {
      return { success: false, error: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },

    getState() {
      return { url: "", title: LOCAL_COMPANION_UNAVAILABLE_REASON };
    },
  };
}

/**
 * Returns a boolean indicating whether any local desktop action type
 * is available. In the placeholder, always returns false.
 */
export function isLocalDesktopActionAvailable(
  _actionType: LocalDesktopActionType,
): boolean {
  return false;
}

/**
 * Attempts a local desktop action. In the placeholder, always returns
 * failure with the unavailable reason. Never produces fake screenshot,
 * action success, file content, clipboard data, terminal output, or
 * compliance guarantees.
 */
export function attemptLocalDesktopAction(_actionType: LocalDesktopActionType): {
  success: false;
  error: string;
} {
  return {
    success: false,
    error: LOCAL_COMPANION_UNAVAILABLE_REASON,
  };
}
