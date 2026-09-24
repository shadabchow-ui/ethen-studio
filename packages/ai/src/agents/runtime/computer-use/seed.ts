import { createRun, listRuns, type CreateRunInput } from "./store";

let _seeded = false;

const MOCK_RUNS: CreateRunInput[] = [
  {
    userId: "demo-user",
    title: "Test Coding Agent Console",
    task: "Open localhost:3000 and test the coding agent console flow. Check composer, timeline, and run creation.",
    mode: "browser",
    provider: "playwright",
    maxSteps: 40,
    allowedDomains: ["localhost:3000"],
  },
  {
    userId: "demo-user",
    title: "Research Browser Automation",
    task: "Visit browserbase.com and playwright.dev to compare features and pricing for browser automation tools.",
    mode: "browser",
    provider: "playwright",
    maxSteps: 30,
    allowedDomains: ["browserbase.com", "playwright.dev"],
    permissionScope: {
      approvalRequiredActions: ["navigate"],
      credentialMode: "none",
    },
  },
  {
    userId: "demo-user",
    title: "Form Fill with Approval",
    task: "Fill in a test form on the demo site. Stop before submitting so I can review.",
    mode: "browser",
    provider: "playwright",
    maxSteps: 25,
    allowedDomains: ["example.com"],
    permissionScope: {
      approvalRequiredActions: ["click", "dom_click", "type"],
      credentialMode: "none",
    },
  },
];

export function seedMockRuns(): void {
  if (_seeded) return;

  const existing = listRuns();
  if (existing.length > 0) {
    _seeded = true;
    return;
  }

  for (const input of MOCK_RUNS) {
    createRun(input);
  }

  _seeded = true;
}

export function isSeeded(): boolean {
  return _seeded;
}

export function resetSeed(): void {
  _seeded = false;
}
