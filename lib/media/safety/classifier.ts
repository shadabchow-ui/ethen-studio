// Re-export safety classifier from lib/media/safety.ts
export {
  classifyMediaSafety,
  mergeGateOutcomes,
  isGateBlocking,
  isConsentRequired,
  isApprovalRequired,
  getGateSummary,
} from "../safety";
export type { SafetyClassifierInput } from "../safety";
