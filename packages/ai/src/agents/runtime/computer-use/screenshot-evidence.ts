import type { ProofService } from "../../../platform/proof";
import type { EvidenceRecord, ProofAccessScope } from "../../../platform/proof";
import type { RunPolicySnapshot } from "../../../platform/runs";

function decodeScreenshot(dataUri: string): { bytes: Uint8Array; mediaType: string; extension: string } {
  const match = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUri);
  if (!match) throw new Error("Screenshot must be an inline PNG, JPEG, or WebP capture for migration.");
  return {
    bytes: Buffer.from(match[3].replace(/\s/g, ""), "base64"),
    mediaType: match[1],
    extension: match[2] === "jpeg" ? "jpg" : match[2],
  };
}

export async function storeComputerUseScreenshotEvidence(input: {
  proof: ProofService;
  scope: ProofAccessScope;
  organizationId: string;
  runId: string;
  attemptId: string;
  screenshotId: string;
  dataUri: string;
  policySnapshot: RunPolicySnapshot;
  capturedAt: string;
}): Promise<EvidenceRecord> {
  const decoded = decodeScreenshot(input.dataUri);
  return input.proof.recordEvidence(input.scope, {
    organizationId: input.organizationId,
    runId: input.runId,
    attemptId: input.attemptId,
    observationType: "computer_use.screenshot",
    source: "computer-use",
    mediaType: decoded.mediaType,
    filename: `${input.screenshotId}.${decoded.extension}`,
    bytes: decoded.bytes,
    policySnapshot: input.policySnapshot,
    metadata: {
      screenshotId: input.screenshotId,
      capturedAt: input.capturedAt,
      inlineSourceRetained: false,
    },
  });
}
