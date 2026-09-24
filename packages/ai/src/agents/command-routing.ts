const INTENT_ROUTES: Record<string, string> = {
  code: "code-helper",
  coding: "code-helper",
  browser: "computer-use-agent",
  browse: "computer-use-agent",
  web: "computer-use-agent",
  automation: "computer-use-agent",
  design: "designer-agent",
  designer: "designer-agent",
  research: "research-agent",
  write: "writing-assistant",
};

export const DEFAULT_AGENT_SLUG = "chatbot-agent";

export function resolveIntentToSlug(input: string): string {
  const lower = input.toLowerCase().trim();
  if (!lower) return DEFAULT_AGENT_SLUG;
  const firstWord = lower.split(/\s+/)[0];
  if (INTENT_ROUTES[firstWord]) return INTENT_ROUTES[firstWord];
  for (const [keyword, slug] of Object.entries(INTENT_ROUTES)) {
    if (lower.startsWith(keyword)) return slug;
  }
  return DEFAULT_AGENT_SLUG;
}

export function buildLaunchUrl(slug: string, prefill: string): string {
  return `/agents/${slug}/launch?prefill=${encodeURIComponent(prefill)}`;
}
