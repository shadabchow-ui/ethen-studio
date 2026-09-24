export const RESEARCH_LIFECYCLE = Object.freeze({
  state: "private_beta",
  label: "Research · Private Beta",
  public: false,
} as const);

/** Convert the canonical Research lifecycle to the portfolio vocabulary. */
export function getResearchPortfolioLifecycle(): "private-beta" {
  return "private-beta";
}

export const RESEARCH_CAPABILITIES = Object.freeze({
  search: { state: "certified", label: "Search", endpoint: "/search" },
  contents: { state: "certified", label: "Contents", endpoint: "/contents" },
  answer: { state: "configured_not_certified", label: "Answer · Uncertified", endpoint: "/answer" },
  agent: { state: "preview", label: "Agent · Preview", endpoint: null },
  deepResearch: { state: "preview", label: "Deep research · Preview", endpoint: null },
} as const);
