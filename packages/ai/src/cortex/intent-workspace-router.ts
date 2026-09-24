import type { EthenIntent, CortexRouteProfile } from "./types";
import { getCortexRouteProfile } from "./routes";
import { AGENT_TRUST_STATES } from "@ethen/contracts/agents/trust-states";
import { getTrustStateMeta, isLaunchable } from "../agents/presentation";
import type { AgentTrustState } from "@ethen/contracts/agents/types";

export interface IntentWorkspaceRoute {
  intent: EthenIntent;
  workspaceSlug: string | null;
  workspaceLabel: string;
  workspaceDescription: string;
  trustState: AgentTrustState;
  trustLabel: string;
  trustHint: string;
  available: boolean;
  blocked: boolean;
  routeProfile: CortexRouteProfile | null;
  launchUrl: string | null;
}

export interface IntentWorkspaceRoutingResult {
  primary: IntentWorkspaceRoute;
  secondary: IntentWorkspaceRoute[];
  staysInCortex: boolean;
}

const INTENT_WORKSPACE_SLUG: Record<string, string | undefined> = {
  "coding.inspect": "code-helper",
  "coding.implement": "code-helper",
  "coding.debug": "code-helper",
  "coding.review": "code-helper",
  "browser.web": "computer-use-agent",
  "browser.automation": "computer-use-agent",
  "design.ui": "designer-agent",
  "design.brand": "designer-agent",
  "media.image": "media-agent",
  "media.video": "media-agent",
  "media.audio": "media-agent",
  "business.startup": "founder-agent",
  "business.strategy": "founder-agent",
  "infrastructure.compute": "compute-agent",
  "infrastructure.deploy": "compute-agent",
  "research.web": "research-agent",
  "research.competitor": "research-agent",
  "research.technical": "research-agent",
  "writing.draft": "writing-assistant",
  "writing.rewrite": "writing-assistant",
  "writing.edit": "writing-assistant",
  "data.analyze": "research-agent",
};

const INTENT_WORKSPACE_LABEL: Partial<Record<EthenIntent, string>> = {
  "coding.inspect": "Coding Agent",
  "coding.implement": "Coding Agent",
  "coding.debug": "Coding Agent",
  "coding.review": "Coding Agent",
  "browser.web": "Computer Use Agent",
  "browser.automation": "Computer Use Agent",
  "design.ui": "Designer Agent",
  "design.brand": "Designer Agent",
  "media.image": "Media Studio",
  "media.video": "Media Studio",
  "media.audio": "Media Studio",
  "business.startup": "Founder Agent",
  "business.strategy": "Founder Agent",
  "infrastructure.compute": "Ethen Compute",
  "infrastructure.deploy": "Ethen Compute",
  "research.web": "Research Agent",
  "research.competitor": "Research Agent",
  "research.technical": "Research Agent",
  "writing.draft": "Writing Assistant",
  "writing.rewrite": "Writing Assistant",
  "writing.edit": "Writing Assistant",
  "data.analyze": "Research Agent",
};

const INTENT_WORKSPACE_DESC: Partial<Record<EthenIntent, string>> = {
  "coding.inspect": "Inspect, debug, implement, and review code with the Coding Agent Console.",
  "coding.implement": "Inspect, debug, implement, and review code with the Coding Agent Console.",
  "coding.debug": "Inspect, debug, implement, and review code with the Coding Agent Console.",
  "coding.review": "Inspect, debug, implement, and review code with the Coding Agent Console.",
  "browser.web": "Browse websites, automate browser tasks, and scrape web content.",
  "browser.automation": "Browse websites, automate browser tasks, and scrape web content.",
  "design.ui": "Design UI layouts, prototypes, wireframes, and screen specs.",
  "design.brand": "Design UI layouts, prototypes, wireframes, and brand identity.",
  "media.image": "Create, edit, and generate images, video, and audio media assets.",
  "media.video": "Create, edit, and generate images, video, and audio media assets.",
  "media.audio": "Create, edit, and generate images, video, and audio media assets.",
  "business.startup": "Develop business plans, go-to-market strategy, pitch decks, and startup strategy.",
  "business.strategy": "Develop business plans, go-to-market strategy, pitch decks, and startup strategy.",
  "infrastructure.compute": "Provision VMs, manage cloud infrastructure, and deploy services.",
  "infrastructure.deploy": "Provision VMs, manage cloud infrastructure, and deploy services.",
  "research.web": "Conduct source-grounded research with search, citations, and evidence.",
  "research.competitor": "Conduct source-grounded research with search, citations, and evidence.",
  "research.technical": "Conduct source-grounded research with search, citations, and evidence.",
  "writing.draft": "Polish, rewrite, and edit writing with clarity and precision.",
  "writing.rewrite": "Polish, rewrite, and edit writing with clarity and precision.",
  "writing.edit": "Polish, rewrite, and edit writing with clarity and precision.",
  "data.analyze": "Analyze data, create charts, and derive insights with research tools.",
};

function getWorkspaceSlug(intent: EthenIntent): string | undefined {
  return INTENT_WORKSPACE_SLUG[intent];
}

function getWorkspaceLabel(intent: EthenIntent): string {
  return INTENT_WORKSPACE_LABEL[intent] ?? "General Chat";
}

function getWorkspaceDescription(intent: EthenIntent): string {
  return INTENT_WORKSPACE_DESC[intent] ?? "General chat and assistance with Cortex.";
}

function resolveTrustState(slug: string | undefined): { trustState: AgentTrustState; trustLabel: string; trustHint: string } {
  if (!slug) {
    return { trustState: "live", trustLabel: "Live", trustHint: "Available in Cortex chat." };
  }
  const state: AgentTrustState = AGENT_TRUST_STATES[slug] ?? "planned";
  const meta = getTrustStateMeta(state);
  return {
    trustState: state,
    trustLabel: meta.label,
    trustHint: meta.hint,
  };
}

export function staysInCortex(intent: EthenIntent): boolean {
  return intent.startsWith("general.") || intent === "unknown";
}

export function resolveIntentWorkspaceRoute(intent: EthenIntent): IntentWorkspaceRoute {
  const slug = getWorkspaceSlug(intent);
  const label = getWorkspaceLabel(intent);
  const description = getWorkspaceDescription(intent);
  const { trustState, trustLabel, trustHint } = resolveTrustState(slug);
  const available = isLaunchable(trustState);
  const blocked = trustState === "setup-required" || trustState === "planned" || trustState === "unavailable";
  const routeProfile = slug ? getCortexRouteProfile(slug) : null;
  // code-helper's chat workspace was retired in favor of the standalone
  // Coding Agent Console at /code — route there directly instead of the
  // generic agent launch flow.
  const launchUrl = slug && available ? (slug === "code-helper" ? "/code" : `/agents/${slug}/launch`) : null;

  return {
    intent,
    workspaceSlug: slug ?? null,
    workspaceLabel: label,
    workspaceDescription: description,
    trustState,
    trustLabel,
    trustHint,
    available,
    blocked,
    routeProfile,
    launchUrl,
  };
}

export function resolveIntentWorkspaceRoutes(classification: {
  primaryIntent: EthenIntent;
  secondaryIntents: EthenIntent[];
}): IntentWorkspaceRoutingResult {
  const primary = resolveIntentWorkspaceRoute(classification.primaryIntent);
  const secondary = classification.secondaryIntents.map(resolveIntentWorkspaceRoute);
  return {
    primary,
    secondary,
    staysInCortex: staysInCortex(classification.primaryIntent),
  };
}
