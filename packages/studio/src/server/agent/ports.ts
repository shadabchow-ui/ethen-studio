/**
 * Studio V5 Creative Agent — real dependency ports (STUDIO_17).
 * Default wiring over j12 (compiler), j03 (policy) and j04 (economics).
 * The agent consumes these ports; it never forks their authority.
 */
import "server-only";
import type { CanvasGraph } from "../../contracts/graph";
import { validateGraph, type GraphValidation } from "../workflow/compiler/validate";
import { canonicalSha256 } from "../workflow/compiler/canonical";
import { evaluatePolicy, type PolicyEvaluation, type PolicyStores } from "../policy/decisions";
import type { PolicyRequest } from "../policy/types";
import { createVersionedQuote, type QuoteInput, type QuoteRepository } from "../economics/quotes";
import type { PriceCatalog } from "../economics/pricing";
import type { VersionedQuote } from "../economics/types";
import type { AgentCompilerPort, AgentEconomicsPort, AgentPolicyPort } from "./types";

/** Real compiler port: j12 validation + canonical SHA-256. */
export const realAgentCompilerPort: AgentCompilerPort = {
  validateGraph(graph: CanvasGraph): GraphValidation {
    return validateGraph(graph);
  },
  hashGraph(graph: CanvasGraph): { canonical: string; sha256: string } {
    const { canonical, sha256 } = canonicalSha256(graph);
    return { canonical, sha256 };
  },
};

/** Real policy port over caller-supplied j03 stores (memory in tests, Supabase in routes). */
export function agentPolicyPortOver(stores: PolicyStores): AgentPolicyPort {
  return {
    evaluate(request: PolicyRequest): Promise<PolicyEvaluation> {
      return evaluatePolicy(stores, request);
    },
  };
}

/** Real economics port over caller-supplied j04 catalog + quotes. */
export function agentEconomicsPortOver(catalog: PriceCatalog, quotes: QuoteRepository): AgentEconomicsPort {
  return {
    catalog,
    quotes,
    quote(input: QuoteInput): Promise<VersionedQuote> {
      return createVersionedQuote(catalog, quotes, input);
    },
  };
}
