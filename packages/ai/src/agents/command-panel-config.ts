export interface AgentCommandChip {
  id: string;
  label: string;
  prefill: string;
}

export interface AgentCommandPanelConfig {
  headline: string;
  placeholder: string;
  chips: AgentCommandChip[];
}

export const CODE_HELPER_COMMAND_PANEL: AgentCommandPanelConfig = {
  headline: "What should we build?",
  placeholder: "Ask Ethen to build, fix, inspect, or refactor…",
  chips: [
    { id: "fix", label: "Fix a bug", prefill: "Fix a bug: " },
    { id: "build", label: "Build a feature", prefill: "Build a feature: " },
    { id: "review", label: "Review code", prefill: "Review code for: " },
  ],
};

export const COMPUTER_USE_COMMAND_PANEL: AgentCommandPanelConfig = {
  headline: "What should Ethen do in the browser?",
  placeholder: "Describe a task for the browser agent…",
  chips: [
    { id: "signup", label: "Test a signup flow", prefill: "Go to this page and test the signup flow, stopping before submitting: " },
    { id: "compare", label: "Compare product pages", prefill: "Open both pages and compare features and prices: " },
    { id: "extract", label: "Extract table rows", prefill: "Open this page and extract the data from the table into a list: " },
    { id: "bugreport", label: "Browse and create a bug report", prefill: "Browse this site and create a bug report for any issues you find: " },
  ],
};

export const DESIGNER_COMMAND_PANEL: AgentCommandPanelConfig = {
  headline: "What should we design?",
  placeholder: "Describe a screen, style, layout, or brand direction…",
  chips: [
    { id: "generate", label: "Generate app design", prefill: "Generate an app design for " },
    { id: "screenshot", label: "Import screenshot", prefill: "Import screenshot: " },
    { id: "template", label: "Use template", prefill: "Use a template for " },
    { id: "options", label: "Options", prefill: "Configure options for " },
  ],
};

export const DEFAULT_CHAT_COMMAND_PANEL: AgentCommandPanelConfig = {
  headline: "Ready when you are.",
  placeholder: "Ask anything or describe what you need…",
  chips: [
    { id: "write", label: "Write or edit", prefill: "Write " },
    { id: "research", label: "Research a topic", prefill: "Research " },
    { id: "summarize", label: "Summarize something", prefill: "Summarize " },
  ],
};

const SLUG_COMMAND_PANEL_REGISTRY: Record<string, AgentCommandPanelConfig> = {
  "code-helper": CODE_HELPER_COMMAND_PANEL,
  "computer-use-agent": COMPUTER_USE_COMMAND_PANEL,
  "designer-agent": DESIGNER_COMMAND_PANEL,
  "chatbot-agent": DEFAULT_CHAT_COMMAND_PANEL,
};

export function getAgentCommandPanelConfig(slug: string): AgentCommandPanelConfig {
  return SLUG_COMMAND_PANEL_REGISTRY[slug] ?? DEFAULT_CHAT_COMMAND_PANEL;
}
