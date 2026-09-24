import type { MediaAppDefinition, MediaAppSafetyMeta } from "../apps";
import type { MediaSafetyGateResult, MediaSafetyGateOutcome } from "./types";

export type AppSafetyGateState =
  | "allowed"
  | "consent_required"
  | "approval_required"
  | "blocked"
  | "safety_review_needed"
  | "not_available_in_mock"
  | "setup_required";

export interface AppSafetyGateResult {
  state: AppSafetyGateState;
  outcome: MediaSafetyGateOutcome | null;
  safetyMeta: MediaAppSafetyMeta | null;
  reasons: string[];
  messages: string[];
  /** User-facing label for the gate state. */
  label: string;
  /** User-facing description for the gate state. */
  description: string;
}

export const APP_SAFETY_GATE_LABELS: Record<AppSafetyGateState, string> = {
  allowed: "Ready",
  consent_required: "Consent Required",
  approval_required: "Approval Required",
  blocked: "Blocked",
  safety_review_needed: "Safety Review Needed",
  not_available_in_mock: "Not Available in Mock Mode",
  setup_required: "Setup Required",
};

export const APP_SAFETY_GATE_DESCRIPTIONS: Record<AppSafetyGateState, string> = {
  allowed: "This app is safe to use.",
  consent_required: "You must provide explicit consent before using this app. Identity-based generation requires documented permission from the depicted person.",
  approval_required: "This workflow requires human review and approval before execution.",
  blocked: "This app is blocked by safety policy. The requested workflow is not allowed.",
  safety_review_needed: "Review the safety cautions below before proceeding.",
  not_available_in_mock: "This app requires a live provider and cannot run in mock preview mode.",
  setup_required: "Provider credentials or execution wiring are still required.",
};

export function evaluateAppGate(app: MediaAppDefinition, consentProvided: boolean): AppSafetyGateResult {
  const safety = app.safety;
  const hasSafetyTriggers = safety && safety.categories.length > 0;
  const isHighRisk = app.riskLevel === "high";

  if (safety?.consentRequired && !consentProvided) {
    return {
      state: "consent_required",
      outcome: "consent_required",
      safetyMeta: safety,
      reasons: [safety.caution ?? "Consent required for this workflow."],
      messages: [safety.caution ?? "You must confirm consent before proceeding."],
      label: APP_SAFETY_GATE_LABELS.consent_required,
      description: APP_SAFETY_GATE_DESCRIPTIONS.consent_required,
    };
  }

  if (isHighRisk && hasSafetyTriggers && !consentProvided) {
    return {
      state: "approval_required",
      outcome: "approval_required",
      safetyMeta: safety,
      reasons: ["High-risk workflow requires consent."],
      messages: ["This high-risk workflow requires your explicit consent before execution."],
      label: APP_SAFETY_GATE_LABELS.approval_required,
      description: APP_SAFETY_GATE_DESCRIPTIONS.approval_required,
    };
  }

  if (isHighRisk && safety?.disclosureRequired && !consentProvided) {
    return {
      state: "safety_review_needed",
      outcome: "warn",
      safetyMeta: safety,
      reasons: ["Disclosure required before execution."],
      messages: [safety.caution ?? "Review safety cautions before proceeding."],
      label: APP_SAFETY_GATE_LABELS.safety_review_needed,
      description: APP_SAFETY_GATE_DESCRIPTIONS.safety_review_needed,
    };
  }

  if (app.trustState === "setup-required" || app.trustState === "provider-unavailable") {
    return {
      state: "setup_required",
      outcome: "setup_required",
      safetyMeta: safety,
      reasons: ["Provider setup required."],
      messages: ["Provider setup is required before execution."],
      label: APP_SAFETY_GATE_LABELS.setup_required,
      description: APP_SAFETY_GATE_DESCRIPTIONS.setup_required,
    };
  }

  if (hasSafetyTriggers && safety?.caution) {
    return {
      state: "safety_review_needed",
      outcome: "warn",
      safetyMeta: safety,
      reasons: [safety.caution],
      messages: [safety.caution],
      label: APP_SAFETY_GATE_LABELS.safety_review_needed,
      description: APP_SAFETY_GATE_DESCRIPTIONS.safety_review_needed,
    };
  }

  return {
    state: "allowed",
    outcome: "allowed",
    safetyMeta: safety,
    reasons: [],
    messages: [],
    label: APP_SAFETY_GATE_LABELS.allowed,
    description: APP_SAFETY_GATE_DESCRIPTIONS.allowed,
  };
}

export function isAppExecutable(app: MediaAppDefinition, consentProvided: boolean): boolean {
  const gate = evaluateAppGate(app, consentProvided);
  return gate.state === "allowed" || gate.state === "safety_review_needed";
}
