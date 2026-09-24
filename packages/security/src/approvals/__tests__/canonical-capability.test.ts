import { createProposal, approveProposal, getProposal, markExecuted, validateProposalForExecution } from "../store";
import { computePayloadHash } from "../../policies/payload-hash";

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

const original = { command: "pnpm test", cwd: "/workspace" };
const proposal = createProposal({
  toolId: "artifact.create",
  riskLevel: "writes_user_content",
  proposedInput: original,
  humanReadableSummary: "Run validation",
  expectedEffect: "Validation output is produced.",
  category: "terminal_command",
  scope: "run:run-capability",
  sessionId: "run-capability",
  userId: "user-a",
  evidenceRefs: ["repo:head:abc"],
});

original.command = "rm -rf .";
const stored = getProposal(proposal.id)!;
assert(stored.proposedInput.command === "pnpm test", "proposal snapshots mutable input");
assert(stored.category === "terminal_command", "proposal records an action category");
assert(stored.actionDigest === computePayloadHash({ command: "pnpm test", cwd: "/workspace" }), "action digest binds exact payload");
assert(stored.evidenceRefs[0] === "repo:head:abc", "evidence references are retained");

const approved = approveProposal(proposal.id)!;
assert(approved.decidedAt !== null && approved.outcome === "approved", "approval records decision metadata");
assert(!validateProposalForExecution(proposal.id, computePayloadHash({ command: "rm -rf .", cwd: "/workspace" })).allowed, "mutated action cannot use approval");

const executed = markExecuted(proposal.id)!;
assert(executed.consumedAt !== null && executed.outcome === "executed", "execution consumes the approval once");
assert(markExecuted(proposal.id) === null, "consumed approval cannot be reused");

if (failures > 0) process.exitCode = 1;
