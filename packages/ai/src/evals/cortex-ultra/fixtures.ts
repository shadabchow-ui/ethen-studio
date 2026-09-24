// ── Cortex Ultra Deterministic Benchmark Fixtures ─────────────────────────
// Offline-only fixtures. No live provider calls. No external benchmarks.
// Each fixture defines a task, expected plan topology, and scoring signals
// that can be checked deterministically against runUltraChat output.

import type { UltraTopology } from "../../cortex-ultra/ultra-types";
import type { WorkerExecutorOutput } from "../../cortex-ultra/worker-runtime";

// ── Fixture category ───────────────────────────────────────────────────────
export type UltraBenchmarkCategory =
  | "coding_repo"
  | "research_evidence"
  | "long_context_synthesis"
  | "tool_use";

// ── Scoring config for a single fixture ────────────────────────────────────
export interface UltraFixtureScoringConfig {
  expectPlanTopology?: UltraTopology;
  expectComplete?: boolean;
  expectVerifierPassed?: boolean;
  expectReceiptAvailable?: boolean;
  expectEvidenceCountMin?: number;
  expectWorkerCountMin?: number;
  expectLimitationsEmpty?: boolean;
}

// ── A single benchmark fixture ─────────────────────────────────────────────
export interface UltraBenchmarkFixture {
  id: string;
  category: UltraBenchmarkCategory;
  prompt: string;
  scoring: UltraFixtureScoringConfig;
  injectedWorkerOutputs: WorkerExecutorOutput[];
  costLimitUsd?: number;
  timeLimitMs?: number;
  maxWorkers?: number;
}

// ── Fixture dataset ────────────────────────────────────────────────────────
export const ULTRA_BENCHMARK_FIXTURES: UltraBenchmarkFixture[] = [
  // ── Coding / repo repair fixtures ────────────────────────────────────────
  {
    id: "coding-single-fix",
    category: "coding_repo",
    prompt: "Fix the broken import in src/utils/parser.ts where the relative path is wrong",
    scoring: {
      expectPlanTopology: "single_verified",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 1,
    },
    injectedWorkerOutputs: [
      {
        outputText: "Fixed relative import from '../../shared/utils' to '../shared/utils' in parser.ts line 12.",
        claims: [
          { summary: "Relative import path corrected", type: "analysis", evidenceIds: ["e1"] },
          { summary: "Module resolves successfully after fix", type: "factual", evidenceIds: ["e2"] },
        ],
        evidenceRefs: ["e1", "e2"],
      },
    ],
    maxWorkers: 1,
  },
  {
    id: "coding-compare-approaches",
    category: "coding_repo",
    prompt: "Compare two approaches for optimizing this React component: memoization vs virtualization",
    scoring: {
      expectPlanTopology: "parallel_primary_and_critic",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 2,
    },
    injectedWorkerOutputs: [
      {
        outputText: "Memoization approach: useMemo and useCallback reduce re-renders by 40%.",
        claims: [
          { summary: "Memoization reduces re-renders by 40%", type: "analysis", evidenceIds: ["e1"] },
        ],
        evidenceRefs: ["e1"],
      },
      {
        outputText: "Virtualization approach: react-window reduces DOM nodes from 5000 to 50.",
        claims: [
          { summary: "Virtualization reduces DOM nodes significantly", type: "analysis", evidenceIds: ["e2"] },
        ],
        evidenceRefs: ["e2"],
      },
    ],
    maxWorkers: 2,
  },

  // ── Research / evidence fixtures ─────────────────────────────────────────
  {
    id: "research-single-source",
    category: "research_evidence",
    prompt: "Research the latest React 19 server component patterns and list key API changes",
    scoring: {
      expectPlanTopology: "tool_heavy_single_worker",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 1,
    },
    injectedWorkerOutputs: [
      {
        outputText: "React 19 adds 'use server' directive, server functions, and server action form handling.",
        claims: [
          { summary: "React 19 adds 'use server' directive for server components", type: "factual", evidenceIds: ["e1"] },
          { summary: "Server actions enable form handling without client JS", type: "factual", evidenceIds: ["e2"] },
        ],
        evidenceRefs: ["e1", "e2"],
      },
    ],
    maxWorkers: 1,
  },
  {
    id: "research-compare-sources",
    category: "research_evidence",
    prompt: "Search and compare the pricing pages for Stripe, Paddle, and Lemonsqueezy for SaaS billing",
    scoring: {
      expectPlanTopology: "tool_heavy_single_worker",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 1,
    },
    injectedWorkerOutputs: [
      {
        outputText: "Stripe: 2.9%+30c, Paddle: 5%+50c MoR, Lemonsqueezy: 5%+50c MoR.",
        claims: [
          { summary: "Stripe charges 2.9% + 30c per transaction", type: "factual", evidenceIds: ["e1"] },
          { summary: "Paddle and Lemonsqueezy act as Merchant of Record", type: "factual", evidenceIds: ["e2"] },
        ],
        evidenceRefs: ["e1", "e2"],
      },
    ],
    maxWorkers: 1,
  },

  // ── Long-context synthesis fixtures ─────────────────────────────────────
  {
    id: "synthesize-multiple-evidence",
    category: "long_context_synthesis",
    prompt: "Summarize the security posture of our application based on the latest scan results, dependency audit, and rate limit analysis",
    scoring: {
      expectPlanTopology: "single_verified",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 1,
    },
    injectedWorkerOutputs: [
      {
        outputText: "Security posture summary: 3 high vulnerabilities in dependencies, rate limiting properly configured, no exposed secrets detected.",
        claims: [
          { summary: "3 high vulnerabilities found in dependencies", type: "factual", evidenceIds: ["e1"] },
          { summary: "Rate limiting is properly configured", type: "analysis", evidenceIds: ["e2"] },
          { summary: "No exposed secrets detected", type: "factual", evidenceIds: ["e3"] },
        ],
        evidenceRefs: ["e1", "e2", "e3"],
      },
    ],
    maxWorkers: 1,
  },
  {
    id: "synthesize-compare-domains",
    category: "long_context_synthesis",
    prompt: "Compare the tradeoffs between monorepo and polyrepo strategies for our 12-team organization with shared design system",
    scoring: {
      expectPlanTopology: "parallel_primary_and_critic",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 2,
    },
    injectedWorkerOutputs: [
      {
        outputText: "Monorepo: strong for shared deps, harder CI isolation. Polyrepo: independent deploys but dependency drift risks.",
        claims: [
          { summary: "Monorepo simplifies shared dependency management", type: "analysis", evidenceIds: ["e1"] },
        ],
        evidenceRefs: ["e1"],
      },
      {
        outputText: "For 12 teams with shared design system, monorepo with Nx or Turborepo is recommended.",
        claims: [
          { summary: "Monorepo with Turborepo recommended for 12 teams", type: "recommendation", evidenceIds: ["e2"] },
        ],
        evidenceRefs: ["e2"],
      },
    ],
    maxWorkers: 2,
  },

  // ── Tool use fixtures ───────────────────────────────────────────────────
  {
    id: "tool-use-data-gathering",
    category: "tool_use",
    prompt: "Find the top 3 most common Node.js security vulnerabilities and their remediation steps",
    scoring: {
      expectPlanTopology: "tool_heavy_single_worker",
      expectComplete: true,
      expectVerifierPassed: true,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 1,
      expectWorkerCountMin: 1,
    },
    injectedWorkerOutputs: [
      {
        outputText: "Top 3: Prototype Pollution (21%), Command Injection (18%), Open Redirect (15%).",
        claims: [
          { summary: "Prototype Pollution is the most common at 21%", type: "factual", evidenceIds: ["e1"] },
          { summary: "Command Injection remediation: validate all inputs", type: "recommendation", evidenceIds: ["e2"] },
          { summary: "Open Redirect: use allowlist for redirect URLs", type: "recommendation", evidenceIds: ["e3"] },
        ],
        evidenceRefs: ["e1", "e2", "e3"],
      },
    ],
    maxWorkers: 1,
  },

  // ── Edge case: worker with unsupported claims ────────────────────────────
  {
    id: "edge-unsupported-claims",
    category: "research_evidence",
    prompt: "What is the exact revenue of OpenAI in 2026 according to public filings?",
    scoring: {
      expectPlanTopology: "tool_heavy_single_worker",
      expectComplete: false,
      expectVerifierPassed: false,
      expectReceiptAvailable: true,
      expectEvidenceCountMin: 0,
    },
    injectedWorkerOutputs: [
      {
        outputText: "OpenAI's revenue is approximately $11.6 billion for fiscal year 2026.",
        claims: [
          { summary: "OpenAI 2026 revenue is approximately $11.6 billion", type: "factual" },
        ],
      },
    ],
    maxWorkers: 1,
  },
];
