/**
 * SSRF guard result shape.
 *
 * Declared with the guard so a shared consumer can name a guard verdict
 * without importing the whole Flows HTTP lane contract.
 */

export interface SSRFGuardResult {
  allowed: boolean;
  reason: string;
  normalizedHost: string;
  riskFlags: string[];
}
