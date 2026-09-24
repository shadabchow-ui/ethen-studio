/**
 * SOL-04 â€” Canonical portfolio registry (sole product-truth source).
 *
 * Hierarchy (reconciled plan):
 *   Workspaces: Model, Code, Research, Security, Studio
 *   Platform: Gateway, Models, Usage, Policies, Credentials, Audit, â€¦
 *   Shared capabilities: Ethen Auto, Local runtimes, Computer Use, MCP, â€¦
 *   Fleet: templates and solution packs only
 *
 * Lifecycle labels are evidence-bound. Route presence alone never implies Live/available.
 */

import { lifecycleWithinEvidence } from "./lifecycle";
import { getResearchPortfolioLifecycle } from "../research/capabilities";
import type {
  DiscoverySurface,
  PortfolioEntry,
  PortfolioEntryInput,
  PortfolioVisibility,
} from "./types";
import { isVisibleOnSurface } from "./lifecycle";


/**
 * Founder lifecycle resolver — fail-closed by default.
 *
 * Founder stays `unavailable` unless an operator explicitly enables it for a
 * certification environment. This mirrors the existing Research/Sentinel
 * enrolment gates and deliberately CANNOT yield GA: the highest value it can
 * return is `private-alpha`, so no environment variable can promote Founder
 * to general availability by label change. The generated lifecycle matrix and
 * every GA claim remain driven by certification evidence, not by this flag.
 */
export function getFounderPortfolioLifecycle(): "unavailable" | "private-alpha" {
  const raw = (process.env.ETHEN_ENABLE_FOUNDER ?? "").trim().toLowerCase();
  const enabled = raw === "1" || raw === "true" || raw === "yes";
  return enabled ? "private-alpha" : "unavailable";
}

const HIDDEN: PortfolioVisibility = {
  navigation: false,
  "command-palette": false,
  sitemap: false,
  search: false,
  fleet: false,
  marketing: false,
};

const NAV_ONLY = (extra?: Partial<PortfolioVisibility>): PortfolioVisibility => ({
  ...HIDDEN,
  navigation: true,
  "command-palette": true,
  search: true,
  ...extra,
});

const PUBLIC_PRODUCT = (extra?: Partial<PortfolioVisibility>): PortfolioVisibility => ({
  navigation: true,
  "command-palette": true,
  sitemap: true,
  search: true,
  fleet: false,
  marketing: true,
  ...extra,
});

const PLATFORM_PUBLIC = (extra?: Partial<PortfolioVisibility>): PortfolioVisibility => ({
  navigation: true,
  "command-palette": true,
  sitemap: false,
  search: true,
  fleet: false,
  marketing: false,
  ...extra,
});

function normalize(input: PortfolioEntryInput): PortfolioEntry {
  return {
    ...input,
    routeAliases: input.routeAliases ?? [],
    productNamespaces: input.productNamespaces ?? [],
    requiredCapabilities: input.requiredCapabilities ?? [],
    providerDependencies: input.providerDependencies ?? [],
  };
}

/**
 * Canonical entries. Classification only â€” do not delete product code here.
 * Evidence notes reflect repository HEAD (audit baseline), not aspirational GA.
 */
const RAW_ENTRIES: readonly PortfolioEntryInput[] = [
  // â”€â”€ Workspaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "model",
    displayName: "Ethen",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "model",
    canonicalRoute: "/console",
    routeAliases: ["/chat", "/chats"],
    productNamespaces: ["/console", "/workspace", "/chat", "/chats"],
    lifecycle: "beta",
    requiredCapabilities: ["gateway-routing", "local-runtimes", "ethen-auto"],
    providerDependencies: ["openai", "anthropic", "deepseek", "ollama"],
    classification: "product",
    visibility: PUBLIC_PRODUCT({ fleet: false, marketing: true }),
    nav: { section: "New work", icon: "chats", order: 10, label: "Ethen" },
    marketingRoute: "/products/ethen",
    agentSlug: "universal-composer-agent",
    oneline: "Project-scoped model workspace for chat, routing, and evidence.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Default console exists as fragments (/ , /chat, /console). Mixed durability; not GA-certified.",
    },
  },
  {
    id: "code",
    displayName: "Code",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "code",
    canonicalRoute: "/code",
    routeAliases: [],
    productNamespaces: ["/code"],
    lifecycle: "beta",
    requiredCapabilities: ["approvals", "isolated-execution", "local-runtimes"],
    providerDependencies: ["openai", "anthropic", "deepseek", "ollama"],
    classification: "product",
    visibility: PUBLIC_PRODUCT(),
    nav: { section: "New work", icon: "terminal", order: 20, badge: "beta" },
    marketingRoute: "/products/code",
    agentSlug: "coding-agent",
    oneline: "Plan-first coding workspace with patch proposals and bounded commands.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Largest real implementation (~60k lines). Full run lifecycle (draft â†’ planning â†’ awaiting_approval â†’ running â†’ completed/failed/cancelled). Patch proposal and apply workflow. Repository management, sandbox strategy, terminal execution. Settings store with migrations. Subagents with guardrails. Approval-gated execution. Audit events and health signals. Not GA-certified.",
    },
  },
  {
    id: "research",
    displayName: "Research",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "research",
    canonicalRoute: "/research",
    routeAliases: ["/agents/research-assistant/launch"],
    productNamespaces: ["/research"],
    lifecycle: getResearchPortfolioLifecycle(),
    requiredCapabilities: ["retrieval", "ethen-auto"],
    providerDependencies: ["exa"],
    classification: "product",
    visibility: {
      navigation: true,
      "command-palette": true,
      sitemap: false,
      search: true,
      fleet: false,
      marketing: false,
    },
    nav: { section: "New work", icon: "files", order: 30 },
    agentSlug: "research-agent",
    oneline: "Exa-backed research with source provenance, claim verification, and durable reports.",
    evidence: {
      maxLifecycle: getResearchPortfolioLifecycle(),
      routeExists: true,
      notes: "Full workspace renders at /research with plan, run, verify, export workflow. Exa provider adapter with mock fallback. Durable job lifecycle with idempotency, cancellation, and checkpoint recovery. Claim-to-source integrity verification. Private beta â€” gated by enrollment flag ETHEN_RESEARCH_PRIVATE_BETA.",
    },
  },
  {
    id: "security",
    displayName: "Sentinel",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "security",
    canonicalRoute: "/sentinel",
    routeAliases: ["/security", "/products/cybersecurity"],
    productNamespaces: ["/sentinel", "/security"],
    lifecycle: "private-alpha",
    requiredCapabilities: ["isolated-execution", "approvals", "evidence"],
    providerDependencies: [],
    classification: "product",
    // Enrolled private-alpha only â€” no public discovery leakage.
    visibility: HIDDEN,
    nav: { section: "New work", icon: "shield", order: 40 },
    marketingRoute: "/products/sentinel",
    agentSlug: "sentinel-agent",
    oneline: "Defensive security engineering (private alpha).",
    evidence: {
      maxLifecycle: "private-alpha",
      routeExists: true,
      notes: "Full security engineering surface at /sentinel with 17+ routes and 34+ UI components. Scanner suite (semgrep, gitleaks, trivy, checkov), static scan runner, finding triage with review pipeline, patch proposal with approval gates, repository intake, evidence viewer, scan history. Enrollment-gated (ETHEN_ENABLE_SENTINEL). Audit events and health signals. Private alpha â€” container isolation not yet mandatory.",
    },
  },
  {
    id: "studio",
    displayName: "Studio",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "studio",
    canonicalRoute: "/studio",
    routeAliases: ["/studio/apps", "/studio/image", "/studio/video", "/studio/audio", "/studio/canvas"],
    productNamespaces: ["/studio"],
    lifecycle: "unavailable",
    requiredCapabilities: ["authenticated-enrollment", "project-membership", "policy", "worker", "storage"],
    providerDependencies: ["openai", "fal"],
    classification: "product",
    visibility: HIDDEN,
    marketingRoute: "/products/studio",
    agentSlug: "media-agent",
    oneline: "Media generation workspace (later beta).",
    evidence: {
      maxLifecycle: "unavailable",
      routeExists: true,
      notes: "22 Studio routes with safety classifier, rights checklist, rate limiting, provider adapters (OpenAI, Fal), storage, pricing, jobs pipeline, media evaluation. Frozen after core launch — generation disabled, data exportable. Audit events and health signals established.",
    },
  },
  {
    id: "designer",
    displayName: "Designer",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "designer",
    canonicalRoute: "/designer",
    // The agent launch route is a compatibility/session-launch alias, not a
    // redirect target: the proxy must never 307 it onto /designer, so it lives
    // in productNamespaces (ownership) instead of routeAliases (redirect).
    routeAliases: [],
    productNamespaces: ["/designer", "/api/designer", "/agents/designer-agent/launch"],
    lifecycle: "unavailable",
    requiredCapabilities: [],
    classification: "product",
    // Independent Product 10 — not a Studio template. Fail-closed by default:
    // lifecycle "unavailable" drives launch denial and hidden discovery.
    visibility: HIDDEN,
    agentSlug: "designer-agent",
    oneline: "Design artifact generation and handoff workspace (unavailable pending certification).",
    evidence: {
      maxLifecycle: "unavailable",
      routeExists: true,
      notes: "24 UI components (DesignCanvas, DesignInspector, ScreenMockupCard, DesignAgentLanding, etc.) with local generator, handoff-to-Code pipeline, export menu, settings, history, and QA panels. Page renders at /designer with provider-aware setup states. Independent product — provider-backed generation deferred pending certification. Audit events and health signals established.",
    },
  },

  {
    id: "founder",
    displayName: "Founder",
    kind: "workspace",
    hierarchyGroup: "workspaces",
    owningWorkspace: "founder",
    canonicalRoute: "/founder-agent",
    // The agent launch route is a compatibility/session-launch alias, not a
    // redirect target: the proxy must never 307 it onto /founder-agent, so it
    // lives in productNamespaces (ownership) instead of routeAliases (redirect).
    routeAliases: [],
    productNamespaces: ["/founder-agent", "/api/founder-agent", "/agents/founder-agent/launch"],
    lifecycle: getFounderPortfolioLifecycle(),
    requiredCapabilities: [],
    classification: "product",
    // Independent Product 11 — not a Fleet template. Fail-closed by default:
    // lifecycle "unavailable" drives launch denial and hidden discovery.
    visibility: HIDDEN,
    agentSlug: "founder-agent",
    oneline: "Founder autonomous business workspace (unavailable pending certification).",
    evidence: {
      maxLifecycle: "unavailable",
      routeExists: true,
      notes: "Dedicated routes (app/founder-agent), API namespace (app/api/founder-agent), migrations (0010_founder_companies, 0010_founder_profiles, 0077_founder_company_operating_model, 0077_founder_durable_orchestration), local draft/cycle tooling, and a task engine with approval/evidence flow exist. Operational capabilities (orchestrator execution, external communications, spending, code/deploy, publishing, connector writes) fail closed pending certification (FND-20).",
    },
  },

  // â”€â”€ Platform â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "firewall",
    displayName: "Firewall",
    kind: "supporting",
    hierarchyGroup: "platform",
    owningWorkspace: "security",
    canonicalRoute: "/firewall",
    productNamespaces: ["/firewall"],
    lifecycle: "preview",
    requiredCapabilities: [],
    providerDependencies: [],
    classification: "capability",
    visibility: HIDDEN,
    oneline: "Separate preview perimeter-posture surface; not a Sentinel route.",
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Firewall is retained as its own preview route and is not a Sentinel compatibility alias.",
    },
  },
  {
    id: "gateway",
    displayName: "Gateway",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/ai-gateway",
    routeAliases: ["/gateway", "/ai-gateway/api-keys", "/ai-gateway/keys", "/products/api"],
    productNamespaces: ["/ai-gateway", "/gateway"],
    lifecycle: "beta",
    requiredCapabilities: ["credentials", "usage", "policies"],
    providerDependencies: ["openai", "anthropic", "deepseek"],
    classification: "product",
    visibility: PUBLIC_PRODUCT({ fleet: false }),
    nav: { section: "Platform", icon: "models", order: 110, label: "Gateway" },
    marketingRoute: "/products/gateway",
    oneline: "Governed model gateway with keys, routing, and usage.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Governed model gateway with four direct provider adapters (OpenAI, Anthropic, DeepSeek, OpenAI-compatible). API key management, usage tracking, rate limiting, budget tracking, and pricing reconciliation. BYOK support. Strongest platform asset â€” providers uncertified at HEAD. Audit events and health signals established.",
    },
  },
  {
    id: "local-models",
    displayName: "Local Models",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/local-models",
    // 2026-09-08 launch route authority: `/models` is the canonical public
    // Models landing page (Open Intelligence entry), not a Local Models alias.
    // Local Models keeps `/local-models` plus the `/products/local` marketing
    // slug; the retired `/models` alias is superseded.
    routeAliases: ["/products/local"],
    productNamespaces: ["/local-models"],
    lifecycle: "beta",
    requiredCapabilities: ["local-runtimes"],
    providerDependencies: ["ollama"],
    classification: "product",
    visibility: PLATFORM_PUBLIC({ sitemap: true, marketing: true }),
    nav: { section: "Platform", icon: "terminal", order: 130 },
    marketingRoute: "/products/local-models",
    oneline: "Local model runtime management â€” install, run, and inspect models on your machine.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "PR-LM-01: Restored first-class local runtime surface with dedicated route and UI.",
    },
  },
  {
    id: "model-library",
    displayName: "Model Library",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/model-library",
    productNamespaces: ["/model-library"],
    lifecycle: "beta",
    requiredCapabilities: ["model-intelligence"],
    classification: "product",
    visibility: PLATFORM_PUBLIC({ sitemap: true, marketing: true }),
    nav: { section: "Platform", icon: "files", order: 120 },
    marketingRoute: "/model-library",
    oneline: "Model intelligence catalog and provider comparisons.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Independent model-intelligence catalog with provider and model detail routes. Not a Local Models runtime surface or a GA certification claim.",
    },
  },
  {
    id: "usage",
    displayName: "Usage",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/usage",
    productNamespaces: ["/usage"],
    lifecycle: "beta",
    requiredCapabilities: ["usage"],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Platform", icon: "billing", order: 130 },
    oneline: "Usage and cost ledger.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Real Supabase-backed usage path with honest zeros when unconfigured.",
    },
  },
  {
    id: "policies",
    displayName: "Policies",
    kind: "supporting",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/policies",
    productNamespaces: ["/policies"],
    lifecycle: "preview",
    requiredCapabilities: ["approvals", "policies"],
    classification: "product",
    visibility: {
      navigation: false,
      "command-palette": true,
      sitemap: false,
      search: true,
      fleet: false,
      marketing: false,
    },
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Policy surfaces exist; enforcement/simulation through canonical approvals/audit path (ETHEN-READY-042).",
    },
  },
  {
    id: "credentials",
    displayName: "Credentials",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    // Settings owns the /settings route; credentials is a platform capability hosted there.
    canonicalRoute: "/__platform__/credentials",
    productNamespaces: [],
    lifecycle: "preview",
    requiredCapabilities: ["credentials"],
    classification: "capability",
    visibility: {
      navigation: false,
      "command-palette": true,
      sitemap: false,
      search: true,
      fleet: false,
      marketing: false,
    },
    nav: { section: "Admin", icon: "permissions", order: 210, label: "Providers & credentials" },
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Credential vault consolidation is a later job; settings hosts provider keys today.",
    },
  },
  {
    id: "audit",
    displayName: "Audit",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/audit-log",
    productNamespaces: ["/audit-log"],
    lifecycle: "private-alpha",
    requiredCapabilities: ["audit"],
    classification: "product",
    visibility: HIDDEN,
    nav: { section: "Admin", icon: "sessions", order: 220 },
    evidence: {
      maxLifecycle: "private-alpha",
      routeExists: true,
      notes: "Wired to in-memory audit service for tenant-authorized data. Supabase persistence is a later job.",
    },
  },
  {
    id: "projects",
    displayName: "Projects",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/projects",
    productNamespaces: ["/projects"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Projects", icon: "project", order: 50 },
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Tenancy unit; hybrid auth-gated + fixture cards.",
    },
  },
  {
    id: "sessions",
    displayName: "Sessions",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/sessions",
    productNamespaces: ["/sessions"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Projects", icon: "sessions", order: 60 },
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Project-scoped session index target; current surface exists.",
    },
  },
  {
    id: "artifacts",
    displayName: "Artifacts",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/artifacts",
    productNamespaces: ["/artifacts"],
    lifecycle: "beta",
    requiredCapabilities: ["evidence"],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Projects", icon: "files", order: 70 },
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Honest storage tiering; real artifact service.",
    },
  },
  {
    id: "approvals",
    displayName: "Approvals",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/approvals",
    productNamespaces: ["/approvals"],
    lifecycle: "private-alpha",
    requiredCapabilities: ["approvals"],
    classification: "product",
    visibility: HIDDEN,
    nav: { section: "Projects", icon: "permissions", order: 80 },
    evidence: {
      maxLifecycle: "private-alpha",
      routeExists: true,
      notes: "Wired to CanonicalApprovalService with in-memory repository. Approve/reject decisions are persistable. Supabase persistence is a later job.",
    },
  },
  {
    id: "fleet",
    displayName: "Fleet",
    kind: "platform",
    hierarchyGroup: "fleet",
    owningWorkspace: "platform",
    canonicalRoute: "/marketplace",
    routeAliases: ["/fleet"],
    productNamespaces: ["/marketplace", "/fleet", "/agents"],
    lifecycle: "preview",
    requiredCapabilities: [],
    classification: "product",
    // Fleet UI retained; lists only template entries from this registry.
    visibility: {
      navigation: true,
      "command-palette": true,
      sitemap: false,
      search: true,
      fleet: false,
      marketing: false,
    },
    nav: { section: "Library", icon: "grid", order: 140 },
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Marketplace UI retained as Fleet template catalogue; not a portfolio of runtimes.",
    },
  },
  {
    id: "settings",
    displayName: "Settings",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/settings",
    productNamespaces: ["/settings"],
    lifecycle: "available",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC({ sitemap: false }),
    nav: { section: "Admin", icon: "settings", order: 230 },
    evidence: {
      maxLifecycle: "available",
      routeExists: true,
      notes: "Settings shell is a supported console surface.",
    },
  },

  // â”€â”€ Shared capabilities (not peer products) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "ethen-auto",
    displayName: "Ethen Auto",
    kind: "shared-capability",
    hierarchyGroup: "shared-capabilities",
    owningWorkspace: "model",
    canonicalRoute: "/__capabilities__/ethen-auto",
    routeAliases: ["/cortex", "/cortex/scorecard"],
    // ROUTE-IDENTITY-CONSOLIDATION-01: /console is the user-facing Ethen Auto
    // surface; Cortex is its internal runtime. Legacy /cortex bookmarks land
    // on the console (previously "/").
    compatibilityTarget: "/console",
    productNamespaces: ["/cortex"],
    lifecycle: "preview",
    requiredCapabilities: [],
    providerDependencies: [],
    classification: "capability",
    visibility: HIDDEN,
    agentSlug: undefined,
    oneline: "Internal routing, planning, and verification (Cortex).",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Cortex routes, classifies, and verifies model requests with circuit-breaking, health signals, structured audit events, and Supabase persistence. Not a navigable product â€” surfacing through /console workspace (beta). Provider calls gated by credential configuration.",
    },
  },
  {
    id: "local-runtimes",
    displayName: "Local runtimes",
    kind: "shared-capability",
    hierarchyGroup: "shared-capabilities",
    owningWorkspace: "model",
    // Capability only â€” Models platform entry owns the /models route namespace.
    canonicalRoute: "/__capabilities__/local-runtimes",
    productNamespaces: [],
    lifecycle: "beta",
    requiredCapabilities: [],
    providerDependencies: ["ollama"],
    classification: "capability",
    visibility: HIDDEN,
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Capability internalized into Model/Models; not a peer flagship. Route owned by models entry.",
    },
  },
  {
    id: "computer-use",
    displayName: "Computer",
    kind: "shared-capability",
    hierarchyGroup: "shared-capabilities",
    owningWorkspace: "code",
    canonicalRoute: "/browser",
    routeAliases: ["/agents/computer-use-agent/launch"],
    productNamespaces: ["/browser"],
    lifecycle: "unavailable",
    requiredCapabilities: ["isolated-execution"],
    classification: "capability",
    visibility: HIDDEN,
    marketingRoute: "/products/computer",
    agentSlug: "computer-use-agent",
    oneline: "Supervised browser automation (deferred; routes gated).",
    evidence: {
      maxLifecycle: "unavailable",
      routeExists: true,
      notes: "Browser session index at /browser with 13 UI components (BrowserSurface, ApprovalCard, GovernancePanel, Timeline). Session creation is subject to the route's existing authorization controls. In-memory run store. Security deferral: Playwright session execution, network isolation, and credential vault integration are not production-ready. /operator is a separate internal observability console; /compute is a separate cloud-infrastructure product.",
    },
  },
  {
    id: "operator-console",
    displayName: "Operator Console",
    kind: "supporting",
    hierarchyGroup: "supporting",
    owningWorkspace: "platform",
    canonicalRoute: "/operator",
    productNamespaces: ["/operator"],
    lifecycle: "preview",
    requiredCapabilities: [],
    classification: "capability",
    visibility: HIDDEN,
    oneline: "Internal observability console for locally available runtime state.",
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Separate internal observability surface. It is not a Computer Use route or compatibility alias.",
    },
  },
  {
    id: "mcp",
    displayName: "MCP",
    kind: "shared-capability",
    hierarchyGroup: "shared-capabilities",
    owningWorkspace: "platform",
    canonicalRoute: "/mcp",
    productNamespaces: ["/mcp"],
    lifecycle: "preview",
    requiredCapabilities: [],
    classification: "capability",
    visibility: HIDDEN,
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "createEmptyMcpRegistry() â€” console permanently empty; deferred.",
    },
  },
  {
    id: "automation",
    displayName: "Flow",
    kind: "shared-capability",
    hierarchyGroup: "shared-capabilities",
    owningWorkspace: "platform",
    canonicalRoute: "/workflow-agent",
    routeAliases: [
      "/workflow-automation",
      "/workflows",
      "/workflow-runs",
      "/workflow-agent/build",
      "/products/workflow",
    ],
    productNamespaces: [
      "/workflow-agent",
      "/workflow-automation",
      "/workflows",
      "/workflow-runs",
    ],
    lifecycle: "unavailable",
    requiredCapabilities: ["connectors"],
    classification: "capability",
    visibility: HIDDEN,
    marketingRoute: "/products/flow",
    agentSlug: "flow-agent",
    oneline: "Workflow automation capability (private preview).",
    evidence: {
      maxLifecycle: "unavailable",
      routeExists: true,
      notes: "50+ lib files: workflow store, run store with idempotency/retry, webhook verification, simulation engine with safety gates, runtime adapters, evidence store. 16 app routes consolidated under /workflow-agent. Frozen after core launch â€” external execution disabled pending durable migration. Audit events and health signals established.",
    },
  },
  {
    id: "voice",
    displayName: "Voice",
    kind: "shared-capability",
    hierarchyGroup: "shared-capabilities",
    owningWorkspace: "studio",
    canonicalRoute: "/voice",
    productNamespaces: ["/voice"],
    lifecycle: "unavailable",
    requiredCapabilities: [],
    providerDependencies: ["elevenlabs", "openai"],
    classification: "capability",
    visibility: HIDDEN,
    oneline: "Voice generation/transcription â€” later Studio Audio.",
    evidence: {
      maxLifecycle: "unavailable",
      routeExists: true,
      notes: "49 lib files: provider adapters (OpenAI, ElevenLabs), phone connectors (Twilio, Telnyx), consent storage (migrations 0032/0033), realtime sessions, voice cloning, dubbing pipeline, agent tools. 14 app routes. Frozen after core launch â€” generation and telephony are disabled. Audit events and health signals established.",
    },
  },

  // â”€â”€ Supporting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "model-intelligence",
    displayName: "Model Intelligence",
    kind: "supporting",
    hierarchyGroup: "supporting",
    owningWorkspace: "platform",
    canonicalRoute: "/model-intelligence",
    productNamespaces: ["/model-intelligence"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PUBLIC_PRODUCT({
      navigation: true,
      fleet: false,
      marketing: true,
    }),
    nav: { section: "Library", icon: "files", order: 135, label: "Leaderboards" },
    oneline: "Public model directory and data layer.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Public model directory with 12 app routes (models, providers, benchmarks, leaderboards, categories). Acquisition + data layer with sourced ingestion, aliases, freshness tracking, and readable analytics. Beta â€” not GA-certified. Audit events and health signals established.",
    },
  },

  // â”€â”€ Operational & Shipped Platform Surfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "observability",
    displayName: "Observability",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/observability",
    productNamespaces: ["/observability", "/api/observability"],
    lifecycle: "preview",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Admin", icon: "sessions", order: 240 },
    oneline: "Traces, health, cost, and model performance observability.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Real observability dashboard surface with traces, costs, models, and errors.",
    },
  },
  {
    id: "evals",
    displayName: "Evals",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/evals",
    productNamespaces: ["/evals"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Admin", icon: "star", order: 250 },
    oneline: "Model evaluation runs and benchmark scoring.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Evaluation framework and benchmark runner surface.",
    },
  },
  {
    id: "logs",
    displayName: "Logs",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/logs",
    productNamespaces: ["/logs"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Admin", icon: "sessions", order: 260 },
    oneline: "System and execution log stream.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Real-time system and agent run execution log viewer.",
    },
  },
  {
    id: "admin",
    displayName: "Administration",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/admin",
    productNamespaces: ["/admin"],
    lifecycle: "private-alpha",
    requiredCapabilities: ["audit"],
    classification: "product",
    // Private internal product â€” must not leak into public discovery.
    // Admin auth requires BOTH admin role AND allowlist (fail-closed).
    visibility: HIDDEN,
    nav: { section: "Admin", icon: "settings", order: 200 },
    oneline: "Platform administration, audit trail, and user management (private alpha).",
    evidence: {
      maxLifecycle: "private-alpha",
      routeExists: true,
      notes: "Admin console surfaces (agents, audit, credits, health, sessions, usage, users, pmf). Admin access is fail-closed (role + allowlist). Audit trail features pagination, redaction, and retention controls (ETHEN-READY-042).",
    },
  },
  {
    id: "platform-status",
    displayName: "Platform Status",
    kind: "supporting",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/platform-status",
    productNamespaces: ["/platform-status"],
    lifecycle: "preview",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC({ sitemap: true }),
    nav: { section: "Admin", icon: "star", order: 270 },
    oneline: "Live service status with real signal aggregation from runtime, storage, kill switches, and audit.",
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Platform status aggregates real signals (provider health, storage health, kill switches, audit events, compute status). Unknown is explicit â€” never reported as healthy (ETHEN-READY-042).",
    },
  },
  {
    id: "environment-variables",
    displayName: "Environment Variables",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/environment-variables",
    productNamespaces: ["/environment-variables"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Admin", icon: "permissions", order: 215 },
    oneline: "Workspace environment variables and secret management.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Environment configuration management surface.",
    },
  },
  {
    id: "agent-runs",
    displayName: "Agent Runs",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/agent-runs",
    routeAliases: ["/runs"],
    productNamespaces: ["/agent-runs", "/runs"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Projects", icon: "sessions", order: 65 },
    oneline: "Run receipts, approvals, evidence, and diagnostics.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Agent run execution log and receipt inspection surface.",
    },
  },
  {
    id: "billing",
    displayName: "Billing",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/billing",
    productNamespaces: ["/billing"],
    lifecycle: "beta",
    requiredCapabilities: [],
    classification: "product",
    visibility: PLATFORM_PUBLIC(),
    nav: { section: "Admin", icon: "billing", order: 235 },
    oneline: "Subscription tier, credits, and payment settings.",
    evidence: {
      maxLifecycle: "beta",
      routeExists: true,
      notes: "Account subscription and billing management page.",
    },
  },
  {
    id: "ethen-hub",
    displayName: "Ethen Hub",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/ethen",
    productNamespaces: ["/ethen"],
    lifecycle: "preview",
    requiredCapabilities: [],
    classification: "product",
    visibility: HIDDEN,
    oneline: "Ethen platform module hub and legacy routes.",
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Internal product module landing routes.",
    },
  },

  // â”€â”€ Fleet templates only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "template-job-search",
    displayName: "Job Search",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/job-search-agent/launch",
    routeAliases: ["/job-seeker-agent"],
    productNamespaces: ["/job-seeker-agent"],
    lifecycle: "retired",
    requiredCapabilities: [],
    classification: "template",
    visibility: {
      navigation: false,
      "command-palette": false,
      sitemap: false,
      search: false,
      fleet: false,
      marketing: false,
    },
    agentSlug: "job-search-agent",
    oneline: "Job search template (retired; not a flagship product).",
    evidence: {
      maxLifecycle: "retired",
      routeExists: true,
      notes: "Non-flagship template retired from Fleet. Historical sessions preserved via compatibility alias.",
    },
  },
  {
    id: "template-writing",
    displayName: "Writing",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/writing-assistant/launch",
    productNamespaces: [],
    lifecycle: "retired",
    requiredCapabilities: [],
    classification: "template",
    visibility: {
      navigation: false,
      "command-palette": false,
      sitemap: false,
      search: false,
      fleet: false,
      marketing: false,
    },
    agentSlug: "writing-assistant",
    oneline: "Writing assistant template (retired; not a flagship product).",
    evidence: {
      maxLifecycle: "retired",
      routeExists: true,
      notes: "Non-flagship template retired from Fleet. Historical sessions preserved via compatibility alias.",
    },
  },
  {
    id: "template-finance",
    displayName: "Finance",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/finance-agent/launch",
    productNamespaces: [],
    lifecycle: "retired",
    requiredCapabilities: [],
    classification: "template",
    visibility: {
      navigation: false,
      "command-palette": false,
      sitemap: false,
      search: false,
      fleet: false,
      marketing: false,
    },
    agentSlug: "finance-agent",
    oneline: "Finance workflows template (retired; not a flagship product).",
    evidence: {
      maxLifecycle: "retired",
      routeExists: true,
      notes: "Non-flagship template retired from Fleet.",
    },
  },
  {
    id: "template-hr",
    displayName: "HR",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/hr-people-ops-agent/launch",
    productNamespaces: [],
    lifecycle: "retired",
    requiredCapabilities: ["approvals", "connectors"],
    classification: "template",
    visibility: {
      navigation: false,
      "command-palette": false,
      sitemap: false,
      search: false,
      fleet: false,
      marketing: false,
    },
    agentSlug: "hr-people-ops-agent",
    oneline: "HR template (retired; not a flagship product).",
    evidence: { maxLifecycle: "retired", routeExists: true, notes: "Non-flagship template retired from Fleet." },
  },
  {
    id: "template-sales",
    displayName: "Sales",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/crm-engagement-agent/launch",
    productNamespaces: [],
    lifecycle: "retired",
    requiredCapabilities: ["approvals", "connectors"],
    classification: "template",
    visibility: {
      navigation: false,
      "command-palette": false,
      sitemap: false,
      search: false,
      fleet: false,
      marketing: false,
    },
    agentSlug: "crm-engagement-agent",
    oneline: "Sales CRM template (retired; not a flagship product).",
    evidence: { maxLifecycle: "retired", routeExists: true, notes: "Non-flagship template retired from Fleet." },
  },
  {
    id: "template-support",
    displayName: "Support",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/customer-support-agent/launch",
    productNamespaces: [],
    lifecycle: "retired",
    requiredCapabilities: ["approvals", "connectors"],
    classification: "template",
    visibility: {
      navigation: false,
      "command-palette": false,
      sitemap: false,
      search: false,
      fleet: false,
      marketing: false,
    },
    agentSlug: "customer-support-agent",
    oneline: "Support template (retired; not a flagship product).",
    evidence: { maxLifecycle: "retired", routeExists: true, notes: "Non-flagship template retired from Fleet." },
  },
  {
    id: "template-marketing",
    displayName: "Marketing",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "model",
    canonicalRoute: "/agents/marketing-campaign-agent/launch",
    productNamespaces: [],
    lifecycle: "retired",
    requiredCapabilities: ["approvals", "connectors"],
    classification: "template",
    visibility: { ...HIDDEN, fleet: false },
    agentSlug: "marketing-campaign-agent",
    oneline: "Marketing campaign template (retired; not a flagship product).",
    evidence: { maxLifecycle: "retired", routeExists: true, notes: "Non-flagship template retired from Fleet." },
  },

  // â”€â”€ Compute (GPU Cloud) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    id: "compute",
    displayName: "Compute",
    kind: "platform",
    hierarchyGroup: "platform",
    owningWorkspace: "platform",
    canonicalRoute: "/compute",
    productNamespaces: ["/compute"],
    lifecycle: "preview",
    requiredCapabilities: ["credentials"],
    providerDependencies: ["thunder-compute"],
    classification: "product",
    // Navigation-visible for enrolled users; not on sitemap or marketing.
    visibility: {
      navigation: true,
      "command-palette": true,
      sitemap: false,
      search: true,
      fleet: false,
      marketing: false,
    },
    nav: { section: "Platform", icon: "terminal", order: 145, badge: "preview", label: "Compute" },
    agentSlug: "gpu-cloud-agent",
    oneline: "GPU compute provisioning, workload management, and cost control.",
    evidence: {
      maxLifecycle: "preview",
      routeExists: true,
      notes: "Compute domain: migrations 0050â€“0056, job store, lease store, resource/recipe repositories, reconciliation ledger, policy layer, pricing, orchestrator worker, teardown saga. 17 GPU tools registered. Page routes at /compute (overview), /compute/instances, /compute/instances/[id], /compute/plan, and /compute/settings are live.",
    },
  },
  {
    id: "template-gpu-cloud",
    displayName: "GPU Cloud",
    kind: "template",
    hierarchyGroup: "fleet",
    owningWorkspace: "platform",
    canonicalRoute: "/agents/gpu-cloud-agent/launch",
    productNamespaces: [],
    lifecycle: "preview",
    requiredCapabilities: ["credentials"],
    providerDependencies: ["thunder-compute"],
    classification: "product",
    // Hidden from all public discovery surfaces â€” enrolled preview only.
    visibility: HIDDEN,
    agentSlug: "gpu-cloud-agent",
    oneline: "GPU cloud agent for Thunder Compute provisioning (enrolled preview).",
    evidence: {
      maxLifecycle: "preview",
      routeExists: false,
      notes: "Fleet entry for GPU cloud agent. Route not yet registered. Compute domain infra is preview-ready.",
    },
  },
];

export const PORTFOLIO_REGISTRY: readonly PortfolioEntry[] = RAW_ENTRIES.map(normalize);

const BY_ID = new Map(PORTFOLIO_REGISTRY.map((e) => [e.id, e]));
const BY_AGENT_SLUG = new Map(
  PORTFOLIO_REGISTRY.filter((e) => e.agentSlug).map((e) => [e.agentSlug as string, e]),
);

export function getPortfolioRegistry(): readonly PortfolioEntry[] {
  return PORTFOLIO_REGISTRY;
}

export function getPortfolioEntry(id: string): PortfolioEntry | undefined {
  return BY_ID.get(id);
}

export function getPortfolioEntryByAgentSlug(slug: string): PortfolioEntry | undefined {
  return BY_AGENT_SLUG.get(slug);
}

export function listPortfolioByKind(
  kind: PortfolioEntry["kind"],
): readonly PortfolioEntry[] {
  return PORTFOLIO_REGISTRY.filter((e) => e.kind === kind);
}

export function listVisiblePortfolio(
  surface: DiscoverySurface,
): readonly PortfolioEntry[] {
  return PORTFOLIO_REGISTRY.filter((e) => isVisibleOnSurface(e, surface));
}

export function listFleetTemplates(): readonly PortfolioEntry[] {
  return PORTFOLIO_REGISTRY.filter(
    (e) => (e.classification === "template" || e.classification === "product") && isVisibleOnSurface(e, "fleet"),
  );
}

/** Fleet-visible agent slugs (templates only). */
export function getFleetVisibleAgentSlugs(): ReadonlySet<string> {
  const slugs = new Set<string>();
  for (const entry of listFleetTemplates()) {
    if (entry.agentSlug) slugs.add(entry.agentSlug);
  }
  return slugs;
}

/**
 * Resolve the portfolio entry that owns a path.
 * Prefers longest productNamespace / alias / canonical match.
 */
export function resolvePortfolioEntryForPath(
  pathname: string,
): PortfolioEntry | undefined {
  const clean = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";

  let best: PortfolioEntry | undefined;
  let bestScore = -1;

  for (const entry of PORTFOLIO_REGISTRY) {
    const candidates = [
      entry.canonicalRoute,
      ...entry.routeAliases,
      ...entry.productNamespaces,
    ];
    for (const candidate of candidates) {
      const ns = candidate === "/" ? "/" : candidate.replace(/\/+$/, "") || "/";
      if (ns === "/") {
        if (clean === "/") {
          if (1 > bestScore) {
            best = entry;
            bestScore = 1;
          }
        }
        continue;
      }
      if (clean === ns || clean.startsWith(`${ns}/`)) {
        const score = ns.split("/").filter(Boolean).length * 10 + ns.length;
        if (score > bestScore) {
          best = entry;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

/**
 * Product route namespaces that every first-class product surface must cover.
 * Used by consistency tests and the CI check.
 */
export const PRODUCT_ROUTE_NAMESPACES = [
  "/code",
  "/research",
  "/sentinel",
  "/studio",
  "/ai-gateway",
  "/local-models",
  "/model-library",
  "/marketplace",
  "/agents",
  "/usage",
  "/policies",
  "/projects",
  "/sessions",
  "/artifacts",
  "/approvals",
  "/audit-log",
  "/mcp",
  "/voice",
  "/workflow-agent",
  "/workflow-automation",
  "/workflows",
  "/workflow-runs",
  "/cortex",
  "/founder-agent",
  "/browser",
  "/operator",
  "/chat",
  "/console",
  "/model-intelligence",
  "/settings",
  "/observability",
  "/evals",
  "/logs",
  "/admin",
  "/platform-status",
  "/environment-variables",
  "/agent-runs",
  "/runs",
  "/billing",
  "/firewall",
  "/ethen",
  "/compute",
  "/designer",
] as const;

/**
 * Schema validation for a single entry (behavioral test + CI).
 * Rejects missing lifecycle, route, owning workspace, and over-claiming lifecycle.
 */
export function validatePortfolioEntry(entry: Partial<PortfolioEntry> & {
  id?: string;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!entry.id || typeof entry.id !== "string") errors.push("missing id");
  if (!entry.displayName) errors.push("missing displayName");
  if (!entry.lifecycle) errors.push("missing lifecycle");
  if (!entry.canonicalRoute) errors.push("missing canonicalRoute (route)");
  if (!entry.owningWorkspace) errors.push("missing owningWorkspace");
  if (!entry.kind) errors.push("missing kind");
  if (!entry.hierarchyGroup) errors.push("missing hierarchyGroup");
  if (!entry.classification) errors.push("missing classification");
  if (!entry.visibility) errors.push("missing visibility");
  if (!entry.evidence) errors.push("missing evidence");

  if (entry.lifecycle && entry.evidence?.maxLifecycle) {
    if (!lifecycleWithinEvidence(entry.lifecycle, entry.evidence.maxLifecycle)) {
      errors.push(
        `lifecycle "${entry.lifecycle}" exceeds evidence maxLifecycle "${entry.evidence.maxLifecycle}"`,
      );
    }
  }

  if (entry.classification === "template" && entry.kind !== "template") {
    errors.push("classification template requires kind template");
  }
  if (entry.kind === "template" && entry.classification !== "template" && entry.classification !== "product") {
    errors.push("kind template requires classification template or product");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validatePortfolioRegistry(
  entries: readonly PortfolioEntry[] = PORTFOLIO_REGISTRY,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`duplicate id: ${entry.id}`);
    ids.add(entry.id);
    const result = validatePortfolioEntry(entry);
    if (!result.ok) {
      for (const e of result.errors) errors.push(`${entry.id}: ${e}`);
    }
  }

  // Every product namespace must resolve to exactly one owner for the root path.
  for (const ns of PRODUCT_ROUTE_NAMESPACES) {
    const owners = entries.filter((entry) => {
      if (entry.canonicalRoute === ns) return true;
      if (entry.routeAliases.includes(ns)) return true;
      return entry.productNamespaces.some(
        (p) => p === ns || (p !== "/" && ns.startsWith(`${p}/`)),
      );
    });
    // Prefer exact namespace claim via productNamespaces or canonical
    const exact = entries.filter(
      (entry) =>
        entry.canonicalRoute === ns ||
        entry.routeAliases.includes(ns) ||
        entry.productNamespaces.includes(ns),
    );
    if (exact.length === 0) {
      errors.push(`namespace ${ns} has no registry entry`);
    } else if (exact.length > 1) {
      const idsOwned = exact.map((e) => e.id).sort();
      errors.push(
        `namespace ${ns} maps to multiple entries: ${idsOwned.join(", ")}`,
      );
    }
    void owners;
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
