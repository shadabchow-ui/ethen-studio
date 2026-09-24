export interface AgentCategory {
  id: string;
  label: string;
  icon: string;
}

export const AGENT_CATEGORIES: AgentCategory[] = [
  { id: "top-picks",      label: "Featured",          icon: "star" },
  { id: "code",           label: "Code",              icon: "code" },
  { id: "design",         label: "Design",            icon: "pencil" },
  { id: "developer-tools",label: "Developer Tools",   icon: "terminal" },
  { id: "finance",        label: "Finance",           icon: "chart" },
  { id: "general",        label: "General",           icon: "message-circle" },
  { id: "maps",           label: "Globe",             icon: "map" },
  { id: "media",          label: "Media",             icon: "image" },
  { id: "personal",       label: "Personal",          icon: "home" },
  { id: "research",       label: "Research",          icon: "search" },
  { id: "writing",        label: "Writing",           icon: "edit" },
];

export const CATEGORY_IDS = AGENT_CATEGORIES.map((c) => c.id);
