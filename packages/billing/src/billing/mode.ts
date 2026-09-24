/** Billing defaults closed. Only an explicit ENABLED posture exposes paid actions. */
export function isBillingEnabled(env: Record<string, string | undefined> = { BILLING_MODE: process.env.BILLING_MODE }): boolean {
  return env.BILLING_MODE === "ENABLED";
}
export function billingDisabledResponse(): Response {
  return Response.json({ ok: false, code: "BILLING_DISABLED", error: "Billing is disabled for this deployment." }, { status: 503 });
}
