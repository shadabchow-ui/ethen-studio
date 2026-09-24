import type {
  AutomationFlow,
  ProcessBottleneck,
  ProcessStep,
  WorkflowAutomationState,
} from "./state";

let _fCounter = 100;
let _sCounter = 500;
let _bCounter = 300;
let _gCounter = 200;

function fid(): string { _fCounter += 1; return `flow-${_fCounter}`; }
function sid(): string { _sCounter += 1; return `step-${_sCounter}`; }
function bid(): string { _bCounter += 1; return `bn-${_bCounter}`; }
function gid(): string { _gCounter += 1; return `gate-${_gCounter}`; }

function step(name: string, type: ProcessStep["stepType"], duration: number, role: string, depends: string[] = [], desc?: string, trigger?: string): ProcessStep {
  return { id: sid(), name, description: desc ?? "", stepType: type, estimatedDuration: duration, responsibleRole: role, dependsOn: depends, triggerEvent: trigger };
}

export const DEFAULT_FLOWS: AutomationFlow[] = [
  {
    id: fid(), name: "Employee Onboarding", description: "End-to-end employee onboarding from offer acceptance to day-1 setup",
    trigger: "HR system offer acceptance event",
    steps: [
      step("Offer Accepted", "trigger", 0, "HR System", [], "Candidate accepts offer letter", "offer_accepted"),
      step("Background Check", "gate", 24, "HR", ["step-501"], "Run background check"),
      step("IT Account Provisioning", "automated", 4, "IT Automation", ["step-502"], "Auto-provision accounts in HRIS, SSO, email"),
      step("Hardware Order", "manual", 48, "IT Support", ["step-503"], "Order and configure laptop/accessories"),
      step("Day-1 Orientation", "manual", 8, "HR", ["step-504", "step-505"], "Welcome session and equipment handoff"),
      step("Tool Access Grant", "gate", 2, "IT Security", ["step-505"], "Grant tool access based on role template"),
    ],
    approvalGates: [
      { id: gid(), name: "Background Check Approval", stepId: "step-502", requiredApprovers: ["HR Manager"], condition: "Pass >= threshold", status: "pending" },
      { id: gid(), name: "Security Access Approval", stepId: "step-507", requiredApprovers: ["IT Security Lead"], condition: "Role-based template match", status: "active" },
    ],
    integrationPoints: ["HRIS", "SSO", "Email System", "IT Asset Management", "Access Control"],
    deploymentStatus: "draft",
  },
  {
    id: fid(), name: "Invoice Processing", description: "Automated invoice receipt through payment scheduling",
    trigger: "Vendor email with invoice attachment",
    steps: [
      step("Invoice Received", "trigger", 0, "Email System", [], "Vendor invoice arrives via email", "invoice_received"),
      step("OCR Data Extraction", "automated", 0.5, "Document AI", ["step-511"], "Extract invoice fields via OCR"),
      step("Vendor Match", "automated", 0.5, "ERP System", ["step-512"], "Auto-match to vendor record"),
      step("PO Verification", "gate", 1, "AP Team", ["step-513"], "Verify invoice matches PO"),
      step("Approval Routing", "gate", 4, "Manager", ["step-514"], "Route for approval based on amount"),
      step("Payment Scheduling", "automated", 0.5, "ERP System", ["step-515"], "Schedule payment on approval"),
    ],
    approvalGates: [
      { id: gid(), name: "PO Match Approval", stepId: "step-514", requiredApprovers: ["AP Manager"], condition: "Match confidence >90%", status: "active" },
      { id: gid(), name: "Payment Approval", stepId: "step-515", requiredApprovers: ["Finance Director"], condition: "Amount > $10k", status: "active" },
    ],
    integrationPoints: ["Email", "Document AI", "ERP", "AP System"],
    deploymentStatus: "draft",
  },
  {
    id: fid(), name: "Customer Support Ticket Lifecycle", description: "Auto-triage, respond, and escalate support tickets",
    trigger: "Customer submits support ticket",
    steps: [
      step("Ticket Submitted", "trigger", 0, "Support Portal", [], "Customer creates ticket", "ticket_created"),
      step("Auto-Triage", "automated", 0.1, "AI Classifier", ["step-521"], "Classify category, priority, sentiment"),
      step("KB Auto-Response", "automated", 0.2, "AI Responder", ["step-522"], "Draft response from KB if available"),
      step("Human Review", "gate", 2, "Support Agent", ["step-523"], "Agent reviews and sends response"),
      step("Escalation Check", "gate", 1, "Support Manager", ["step-524"], "Escalate if unresolved after threshold"),
      step("SLA Monitoring", "automated", 0, "Monitoring", ["step-521"], "Track SLA compliance in real-time"),
    ],
    approvalGates: [
      { id: gid(), name: "Response Approval", stepId: "step-524", requiredApprovers: ["Senior Agent"], condition: "Confidence < 80%", status: "active" },
      { id: gid(), name: "Escalation Approval", stepId: "step-525", requiredApprovers: ["Support Manager"], condition: "Unresolved > 4h", status: "pending" },
    ],
    integrationPoints: ["Support Portal", "KB System", "Email", "SLA Monitor"],
    deploymentStatus: "review",
  },
];

export const DEFAULT_BOTTLENECKS: ProcessBottleneck[] = [
  { id: bid(), stepId: "step-504", severity: "high", description: "Hardware ordering is manual and takes 48h average", impact: "Delays onboarding by 2+ days for 60% of new hires", recommendation: "Integrate with hardware vendor API for auto-ordering" },
  { id: bid(), stepId: "step-515", severity: "medium", description: "PO verification requires manual document comparison", impact: "AP team spends 12h/week on PO matching", recommendation: "Implement AI-based PO matching with confidence scoring" },
  { id: bid(), stepId: "step-524", severity: "low", description: "Response approval creates 2h average delay for high-confidence tickets", impact: "Increases first-response time metric", recommendation: "Auto-approve responses with >95% confidence score" },
];

export function createInitialWorkflowAutomationState(): WorkflowAutomationState {
  return {
    flows: DEFAULT_FLOWS.map((f) => ({
      ...f,
      steps: f.steps.map((s) => ({ ...s })),
      approvalGates: f.approvalGates.map((g) => ({ ...g })),
    })),
    bottlenecks: DEFAULT_BOTTLENECKS.map((b) => ({ ...b })),
    artifacts: [],
    activityLog: [],
    selectedFlowId: null,
    expandedArtifactId: null,
  };
}
