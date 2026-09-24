import type { ComputerActionType, ComputerAction, SensitiveActionCategory } from "./types";
import { isDesktopActionType } from "./types";

export type ComputerUseRiskLevel = "low" | "medium" | "high" | "critical";

export interface SensitiveActionDetection {
  category: SensitiveActionCategory;
  severity: "low" | "medium" | "high" | "critical";
  evidence: string;
}

const ACTION_RISK_MAP: Record<ComputerActionType, ComputerUseRiskLevel> = {
  screenshot: "low",
  wait: "low",
  inspectDom: "low",
  click: "medium",
  double_click: "medium",
  scroll: "medium",
  type: "medium",
  key: "medium",
  pressKey: "medium",
  drag: "medium",
  dom_click: "medium",
  dom_type: "medium",
  navigate: "high",
  complete: "low",
  fail: "low",
  extractText: "low",
  extractLinks: "low",
  extractHeadings: "low",
  extractTable: "low",
  // Desktop-class actions — all high or critical by default
  desktop_screenshot: "high",
  desktop_click: "high",
  desktop_type: "high",
  desktop_key: "high",
  desktop_scroll: "high",
  desktop_app_switch: "high",
  desktop_app_open: "high",
  desktop_clipboard_read: "critical",
  desktop_clipboard_write: "critical",
  desktop_file_download: "critical",
  desktop_file_upload: "critical",
  desktop_file_access: "critical",
  desktop_terminal_exec: "critical",
  desktop_credential_field: "critical",
  desktop_os_settings: "critical",
  desktop_system_dialog: "high",
};

const SUBMIT_RISK_ACTIONS: Set<ComputerActionType> = new Set(["click", "dom_click", "type", "dom_type", "key", "pressKey"]);
const DOWNLOAD_UPLOAD_RISK_ACTIONS: Set<ComputerActionType> = new Set(["click", "dom_click"]);
const BLOCKED_ACTION_TYPES: Set<ComputerActionType> = new Set([]);

export function isDesktopAction(actionType: ComputerActionType): boolean {
  return isDesktopActionType(actionType);
}

export function isKnownActionType(actionType: ComputerActionType): boolean {
  return actionType in ACTION_RISK_MAP;
}

export function getActionRiskLevel(actionType: ComputerActionType): ComputerUseRiskLevel {
  return ACTION_RISK_MAP[actionType] ?? "high";
}

export function isLowRiskAction(actionType: ComputerActionType): boolean {
  return getActionRiskLevel(actionType) === "low";
}

export function isMediumRiskAction(actionType: ComputerActionType): boolean {
  return getActionRiskLevel(actionType) === "medium";
}

export function isHighRiskAction(actionType: ComputerActionType): boolean {
  return getActionRiskLevel(actionType) === "high";
}

export function isCriticalRiskAction(actionType: ComputerActionType): boolean {
  return getActionRiskLevel(actionType) === "critical";
}

export function isDefaultBlockedAction(actionType: ComputerActionType): boolean {
  return BLOCKED_ACTION_TYPES.has(actionType);
}

export function couldBeFormSubmit(action: ComputerAction): boolean {
  if (!SUBMIT_RISK_ACTIONS.has(action.type)) return false;
  if (action.metadata?.submitRisk === true) return true;
  if (action.targetLabel) {
    const label = action.targetLabel.toLowerCase();
    const submitKeywords = [
      // form submission
      "submit", "save", "confirm",
      // purchase / payment
      "pay", "order", "checkout", "buy", "purchase", "charge", "donate", "transfer",
      // account settings
      "create account", "sign up", "register", "change password", "reset password",
      "update profile", "settings", "unsubscribe", "deactivate", "close account",
      // publishing / posting
      "publish", "post", "share", "broadcast",
      // destructive
      "delete", "remove", "clear", "erase",
      // messaging / email
      "send", "message", "email", "compose", "reply",
    ];
    for (const kw of submitKeywords) {
      if (label.includes(kw)) return true;
    }
  }
  if (action.text) {
    const text = action.text.toLowerCase();
    if (text.includes("{enter}") || text.includes("{return}")) return true;
  }
  return false;
}

export function couldBeDownload(action: ComputerAction): boolean {
  if (!DOWNLOAD_UPLOAD_RISK_ACTIONS.has(action.type)) return false;
  if (action.metadata?.downloadRisk === true) return true;
  if (action.targetLabel) {
    const label = action.targetLabel.toLowerCase();
    const dlKeywords = ["download", "export", "save as", "save file", "save image", "save to", "get file"];
    for (const kw of dlKeywords) {
      if (label.includes(kw)) return true;
    }
  }
  return false;
}

export function couldBeUpload(action: ComputerAction): boolean {
  if (!DOWNLOAD_UPLOAD_RISK_ACTIONS.has(action.type)) return false;
  if (action.metadata?.uploadRisk === true) return true;
  if (action.targetLabel) {
    const label = action.targetLabel.toLowerCase();
    const ulKeywords = ["upload", "attach", "choose file", "browse", "import", "add file", "select file", "pick file"];
    for (const kw of ulKeywords) {
      if (label.includes(kw)) return true;
    }
  }
  return false;
}

const MUTATION_ACTIONS: Set<ComputerActionType> = new Set(["click", "dom_click", "type", "dom_type", "key", "pressKey"]);

function matchLabel(action: ComputerAction, keywords: string[]): boolean {
  if (!action.targetLabel) return false;
  const label = action.targetLabel.toLowerCase();
  return keywords.some((kw) => label.includes(kw));
}

export function couldBePayment(action: ComputerAction): boolean {
  if (!MUTATION_ACTIONS.has(action.type)) return false;
  if (action.metadata?.paymentRisk === true) return true;
  return matchLabel(action, [
    "pay", "payment", "checkout", "buy", "purchase", "order", "charge",
    "donate", "transfer", "subscribe", "billing", "credit card", "card number",
    "cvv", "expiry", "cvc",
  ]);
}

export function couldBeCredentialEntry(action: ComputerAction): boolean {
  const type = action.type;
  if (!MUTATION_ACTIONS.has(type) && type !== "type" && type !== "dom_type") return false;
  if (action.sensitive === true) return true;
  if (action.metadata?.credentialRisk === true) return true;
  return matchLabel(action, [
    "password", "passcode", "secret", "token", "api key", "credential",
    "sign in", "log in", "login",
  ]);
}

export function couldBeDestructive(action: ComputerAction): boolean {
  if (!MUTATION_ACTIONS.has(action.type)) return false;
  if (action.metadata?.destructiveRisk === true) return true;
  return matchLabel(action, [
    "delete", "remove", "clear", "erase", "destroy", "wipe", "purge",
    "unlink", "revoke", "reset",
  ]);
}

export function couldBeAccountChange(action: ComputerAction): boolean {
  if (!MUTATION_ACTIONS.has(action.type)) return false;
  if (action.metadata?.accountChangeRisk === true) return true;
  return matchLabel(action, [
    "create account", "sign up", "register", "change password", "reset password",
    "update profile", "settings", "unsubscribe", "deactivate", "close account",
    "change email", "change plan", "upgrade", "downgrade",
  ]);
}

export function couldBeExternalMessage(action: ComputerAction): boolean {
  if (!MUTATION_ACTIONS.has(action.type)) return false;
  if (action.metadata?.externalMessageRisk === true) return true;
  return matchLabel(action, [
    "send", "post", "publish", "share", "broadcast", "tweet", "message",
    "email", "compose", "reply", "comment",
  ]);
}

export function couldBeCaptchaOrMfa(action: ComputerAction): boolean {
  if (action.type === "type" || action.type === "dom_type") {
    if (action.metadata?.captchaMfaRisk === true) return true;
    return matchLabel(action, [
      "captcha", "recaptcha", "hcaptcha", "verification code", "2fa code",
      "mfa code", "two-factor", "authenticator", "otp", "one-time",
      "verify", "security code",
    ]);
  }
  return false;
}

export function detectSensitiveActionCategories(action: ComputerAction): SensitiveActionDetection[] {
  const results: SensitiveActionDetection[] = [];

  if (couldBePayment(action)) {
    results.push({ category: "payment_checkout", severity: "high", evidence: `Target label "${action.targetLabel}" matches payment keywords` });
  }
  if (couldBeCredentialEntry(action)) {
    results.push({ category: "credential_entry_use", severity: "critical", evidence: `Target label "${action.targetLabel}" matches credential keywords` });
  }
  if (couldBeDestructive(action)) {
    results.push({ category: "delete_destructive_change", severity: "high", evidence: `Target label "${action.targetLabel}" matches destructive keywords` });
  }
  if (couldBeAccountChange(action)) {
    results.push({ category: "account_change", severity: "high", evidence: `Target label "${action.targetLabel}" matches account change keywords` });
  }
  if (couldBeExternalMessage(action)) {
    results.push({ category: "message_send_post", severity: "medium", evidence: `Target label "${action.targetLabel}" matches message/send keywords` });
  }
  if (couldBeCaptchaOrMfa(action)) {
    results.push({ category: "captcha_mfa_login_blocker", severity: "medium", evidence: `Target label "${action.targetLabel}" matches CAPTCHA/MFA keywords` });
  }
  if (couldBeUpload(action)) {
    results.push({ category: "upload", severity: "medium", evidence: `Target label "${action.targetLabel}" matches upload keywords` });
  }
  if (couldBeDownload(action)) {
    results.push({ category: "download", severity: "medium", evidence: `Target label "${action.targetLabel}" matches download keywords` });
  }
  if (couldBeFormSubmit(action)) {
    results.push({ category: "form_submit", severity: "high", evidence: `Target label "${action.targetLabel}" matches form submit keywords` });
  }

  return results;
}
