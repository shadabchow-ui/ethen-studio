export interface AdapterCertificationReceipt {
  providerId: string;
  model: string | null;
  certifiedAt: string;
  expiresAt: string;
  commit: string;
  mode: "live" | "recorded_replay";
  scope: "gateway" | "local_read_only";
  requestShape: string;
  responseShape: string;
  result: "pass" | "fail" | "blocked";
  evidence: string;
}

export function isCertificationCurrent(
  receipt: AdapterCertificationReceipt,
  now = new Date(),
): boolean {
  return (
    receipt.result === "pass" &&
    Date.parse(receipt.certifiedAt) <= now.getTime() &&
    Date.parse(receipt.expiresAt) > now.getTime()
  );
}

