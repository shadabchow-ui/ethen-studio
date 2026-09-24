import type { PermissionScope, PolicyAccessMode } from "./types";
import { POLICY_TEMPLATE_NAMES, isDesktopActionType } from "./types";

export interface PolicyTemplate {
  name: PolicyAccessMode;
  label: string;
  description: string;
  scope: PermissionScope;
}

export const OBSERVE_ONLY_TEMPLATE: PolicyTemplate = {
  name: "observe-only",
  label: "Observe Only",
  description:
    "The agent can only observe (screenshot, wait, inspect DOM). No navigation, clicking, typing, form interaction, or file operations. Safest mode for inspecting existing pages.",
  scope: {
    accessMode: "observe-only",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: ["screenshot", "wait", "inspectDom"],
    approvalRequiredActions: [],
    blockedActions: [
      "navigate",
      "click",
      "double_click",
      "drag",
      "scroll",
      "type",
      "key",
      "pressKey",
      "dom_click",
      "dom_type",
      "complete",
      "fail",
      "desktop_screenshot",
      "desktop_click",
      "desktop_type",
      "desktop_key",
      "desktop_scroll",
      "desktop_app_switch",
      "desktop_app_open",
      "desktop_clipboard_read",
      "desktop_clipboard_write",
      "desktop_file_download",
      "desktop_file_upload",
      "desktop_file_access",
      "desktop_terminal_exec",
      "desktop_credential_field",
      "desktop_os_settings",
      "desktop_system_dialog",
    ],
    credentialMode: "none",
    fileSystemScope: "none",
    networkMode: "allowlist",
    dataRetention: "session-only",
    maxSteps: 20,
    maxRuntimeMinutes: 10,
  },
};

export const GUIDED_BROWSER_TEMPLATE: PolicyTemplate = {
  name: "guided-browser",
  label: "Guided Browser",
  description:
    "The agent can navigate, click, type, and scroll, but every navigation, form submit, and data entry action requires user approval. Best for workflows where the user wants to confirm each step.",
  scope: {
    accessMode: "guided-browser",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: [
      "screenshot",
      "click",
      "type",
      "scroll",
      "navigate",
      "wait",
      "double_click",
      "key",
      "dom_click",
      "dom_type",
      "drag",
      "inspectDom",
      "extractText",
      "extractLinks",
      "extractHeadings",
      "extractTable",
    ],
    approvalRequiredActions: ["navigate", "click", "type", "key", "dom_click", "dom_type"],
    blockedActions: [
      "desktop_screenshot",
      "desktop_click",
      "desktop_type",
      "desktop_key",
      "desktop_scroll",
      "desktop_app_switch",
      "desktop_app_open",
      "desktop_clipboard_read",
      "desktop_clipboard_write",
      "desktop_file_download",
      "desktop_file_upload",
      "desktop_file_access",
      "desktop_terminal_exec",
      "desktop_credential_field",
      "desktop_os_settings",
      "desktop_system_dialog",
    ],
    credentialMode: "takeover",
    fileSystemScope: "none",
    networkMode: "allowlist",
    dataRetention: "standard",
    maxSteps: 30,
    maxRuntimeMinutes: 20,
  },
};

export const AUTONOMOUS_BROWSER_TEMPLATE: PolicyTemplate = {
  name: "autonomous-browser",
  label: "Autonomous Browser",
  description:
    "The agent can navigate, click, type, and scroll autonomously. Only form submissions and download/upload actions require approval. Best for hands-off browsing tasks on trusted domains.",
  scope: {
    accessMode: "autonomous-browser",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: [
      "screenshot",
      "click",
      "type",
      "scroll",
      "navigate",
      "wait",
      "double_click",
      "key",
      "dom_click",
      "dom_type",
      "drag",
      "inspectDom",
      "extractText",
      "extractLinks",
      "extractHeadings",
      "extractTable",
    ],
    approvalRequiredActions: [],
    blockedActions: [
      "desktop_screenshot",
      "desktop_click",
      "desktop_type",
      "desktop_key",
      "desktop_scroll",
      "desktop_app_switch",
      "desktop_app_open",
      "desktop_clipboard_read",
      "desktop_clipboard_write",
      "desktop_file_download",
      "desktop_file_upload",
      "desktop_file_access",
      "desktop_terminal_exec",
      "desktop_credential_field",
      "desktop_os_settings",
      "desktop_system_dialog",
    ],
    credentialMode: "takeover",
    fileSystemScope: "workspace-read",
    networkMode: "allowlist",
    dataRetention: "standard",
    maxSteps: 50,
    maxRuntimeMinutes: 30,
  },
};

export const QA_BROWSER_TEMPLATE: PolicyTemplate = {
  name: "qa-browser",
  label: "QA Browser",
  description:
    "The agent can navigate, inspect, screenshot, click, and scroll for testing purposes. Submits, deletes, payments, and credential access are blocked. File downloads are read-only. Best for QA, accessibility audits, and visual regression testing.",
  scope: {
    accessMode: "qa-browser",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: [
      "screenshot",
      "click",
      "type",
      "scroll",
      "navigate",
      "wait",
      "double_click",
      "key",
      "dom_click",
      "dom_type",
      "drag",
      "inspectDom",
      "extractText",
      "extractLinks",
      "extractHeadings",
      "extractTable",
    ],
    approvalRequiredActions: ["click", "type", "key", "dom_click", "dom_type"],
    blockedActions: [
      "desktop_screenshot",
      "desktop_click",
      "desktop_type",
      "desktop_key",
      "desktop_scroll",
      "desktop_app_switch",
      "desktop_app_open",
      "desktop_clipboard_read",
      "desktop_clipboard_write",
      "desktop_file_download",
      "desktop_file_upload",
      "desktop_file_access",
      "desktop_terminal_exec",
      "desktop_credential_field",
      "desktop_os_settings",
      "desktop_system_dialog",
    ],
    credentialMode: "none",
    fileSystemScope: "workspace-read",
    networkMode: "allowlist",
    dataRetention: "standard",
    maxSteps: 60,
    maxRuntimeMinutes: 45,
  },
};

export const POLICY_TEMPLATES: Record<PolicyAccessMode, PolicyTemplate> = {
  "observe-only": OBSERVE_ONLY_TEMPLATE,
  "guided-browser": GUIDED_BROWSER_TEMPLATE,
  "autonomous-browser": AUTONOMOUS_BROWSER_TEMPLATE,
  "qa-browser": QA_BROWSER_TEMPLATE,
};

export function getPolicyTemplate(name: PolicyAccessMode): PolicyTemplate {
  return POLICY_TEMPLATES[name];
}

export function isPolicyTemplateName(name: string): name is PolicyAccessMode {
  return POLICY_TEMPLATE_NAMES.includes(name as PolicyAccessMode);
}

export function resolvePermissionScope(
  templateName?: PolicyAccessMode,
  overrides?: Partial<PermissionScope>,
): PermissionScope {
  if (templateName && isPolicyTemplateName(templateName)) {
    return { ...POLICY_TEMPLATES[templateName].scope, ...overrides };
  }

  const defaultScope: PermissionScope = {
    accessMode: "guided-browser",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: [
      "screenshot",
      "click",
      "type",
      "scroll",
      "navigate",
      "wait",
      "extractText",
      "extractLinks",
      "extractHeadings",
      "extractTable",
    ],
    approvalRequiredActions: ["navigate", "click", "type"],
    blockedActions: [
      "desktop_screenshot",
      "desktop_click",
      "desktop_type",
      "desktop_key",
      "desktop_scroll",
      "desktop_app_switch",
      "desktop_app_open",
      "desktop_clipboard_read",
      "desktop_clipboard_write",
      "desktop_file_download",
      "desktop_file_upload",
      "desktop_file_access",
      "desktop_terminal_exec",
      "desktop_credential_field",
      "desktop_os_settings",
      "desktop_system_dialog",
    ],
    credentialMode: "none",
    fileSystemScope: "none",
    networkMode: "allowlist",
    dataRetention: "session-only",
    maxSteps: 40,
    maxRuntimeMinutes: 15,
    ...overrides,
  };
  return defaultScope;
}
