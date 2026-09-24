import { SEED_AGENTS } from "@ethen/config/mock/seed-agents";

export interface ParsedAgentInventoryRecord {
  slug: string;
  name: string;
  status: string;
  visibility: string;
  disposition: "FLAGSHIP_PRODUCT" | "COMPATIBILITY_ALIAS" | "CATALOG_ENTRY";
  reachabilityClassification: {
    backendExecution: boolean;
  };
  backendExecutabilityEvidence: {
    isBackendExecutable: boolean;
    executabilityState: "executable_flagship" | "not_started";
  };
}

export function getParsedAgentInventory(): ParsedAgentInventoryRecord[] {
  return SEED_AGENTS.map((agent) => {
    const isFlagship = [
      "research-agent",
      "coding-agent",
      "universal-composer-agent",
      "sentinel-agent",
      "computer-use-agent",
      "media-agent",
      "flow-agent",
      "designer-agent",
      "founder-agent",
      "compute-agent",
      "vm-agent",
    ].includes(agent.slug);

    const isAlias =
      agent.slug === "research-assistant" ||
      agent.slug === "code-helper" ||
      agent.slug === "workflow-automation-agent" ||
      agent.slug === "writing-assistant" ||
      agent.slug === "job-search-agent";

    const disposition = isFlagship
      ? "FLAGSHIP_PRODUCT"
      : isAlias
        ? "COMPATIBILITY_ALIAS"
        : "CATALOG_ENTRY";

    const isBackendExecutable =
      isFlagship || agent.slug === "writing-assistant" || agent.slug === "job-search-agent";

    return {
      slug: agent.slug,
      name: agent.name,
      status: agent.status,
      visibility: agent.visibility,
      disposition,
      reachabilityClassification: {
        backendExecution: isBackendExecutable,
      },
      backendExecutabilityEvidence: {
        isBackendExecutable,
        executabilityState: isBackendExecutable ? "executable_flagship" : "not_started",
      },
    };
  });
}
