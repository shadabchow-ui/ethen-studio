export type AgentInspectorSection =
  | "mission"
  | "chat"
  | "tools"
  | "settings"
  | "activity"
  | "memory"
  | "permissions"
  | "artifacts"
  | "history";

export interface AgentInspectorConfig {
  title: string;
  subtitle?: string;
  sections: AgentInspectorSection[];
  tools: string[];
  sectionLabels?: Partial<Record<AgentInspectorSection, string>>;
}

const CODING_AGENT_INSPECTOR: AgentInspectorConfig = {
  title: "Coding Agent",
  subtitle: "Mission control for this build",
  // "settings" is first: the real coding controls (repo, bridge, provider, workflow,
  // access mode, files/QA/traces/terminal) are supplied via overrideSections.settings
  // from CodeHelperWorkspace and should be the default visible content, not a
  // generic placeholder tab. "tools" is omitted here since it has no real content yet.
  sections: ["settings", "mission", "chat", "activity", "artifacts"],
  tools: ["Files", "Diff", "Terminal", "Tests", "Preview"],
};

const COMPUTER_USE_AGENT_INSPECTOR: AgentInspectorConfig = {
  title: "Computer Use Inspector",
  subtitle: "Browser session, safety, and evidence",
  sections: ["mission", "chat", "tools", "artifacts", "permissions", "activity", "settings"],
  tools: ["Browser", "Actions", "Screenshots", "Evidence", "Network"],
  sectionLabels: {
    mission: "Controls",
    chat: "Page",
    tools: "Actions",
    artifacts: "Evidence",
    permissions: "Permissions",
    activity: "Activity",
    settings: "Settings",
  },
};

const DESIGNER_AGENT_INSPECTOR: AgentInspectorConfig = {
  title: "Design Inspector",
  subtitle: "Screen, layout, and theme control",
  sections: ["settings", "activity", "artifacts", "memory", "history"],
  tools: ["Inspector", "Layout", "Components", "QA", "Handoff"],
  sectionLabels: {
    settings: "Inspector",
    activity: "Settings",
    artifacts: "Handoff",
    memory: "QA",
    history: "History",
  },
};

const DEFAULT_CHAT_AGENT_INSPECTOR: AgentInspectorConfig = {
  title: "Chat Agent",
  subtitle: "Conversation control",
  sections: ["mission", "chat", "artifacts", "memory", "settings"],
  tools: ["Chat", "Sources", "Artifacts"],
};

const SLUG_INSPECTOR_REGISTRY: Record<string, AgentInspectorConfig> = {
  "code-helper": CODING_AGENT_INSPECTOR,
  "computer-use-agent": COMPUTER_USE_AGENT_INSPECTOR,
  "designer-agent": DESIGNER_AGENT_INSPECTOR,
  "chatbot-agent": DEFAULT_CHAT_AGENT_INSPECTOR,
};

export function getAgentInspectorConfig(slug: string, agentName?: string): AgentInspectorConfig {
  const config = SLUG_INSPECTOR_REGISTRY[slug];
  if (config) return config;
  return {
    ...DEFAULT_CHAT_AGENT_INSPECTOR,
    title: agentName ?? DEFAULT_CHAT_AGENT_INSPECTOR.title,
  };
}
