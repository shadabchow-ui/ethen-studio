import type { AgentSidebarSection } from "./types";

const AGENT_SIDEBAR_SECTIONS: Record<string, AgentSidebarSection[]> = {
  "code-helper": [
    { id: "project",     label: "Project",      defaultOpen: true,  hidden: true, items: [
      { id: "project-overview", label: "Overview", badge: "Read-only", disabled: true },
      { id: "project-structure", label: "Structure", badge: "Read-only", disabled: true },
    ]},
    { id: "files",       label: "Files",        collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "files-explorer", label: "Explorer", badge: "Read-only", disabled: true },
      { id: "files-open", label: "Open Files", badge: "Read-only", disabled: true },
    ]},
    { id: "search",      label: "Search",       collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "search-code", label: "Code Search", badge: "Read-only", disabled: true },
      { id: "search-symbols", label: "Symbols", badge: "Soon", disabled: true },
    ]},
    { id: "git",         label: "Git",          collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "git-changes", label: "Changes", badge: "Read-only", disabled: true },
      { id: "git-log", label: "History", badge: "Read-only", disabled: true },
    ]},
    { id: "tasks",       label: "Tasks",        collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "tasks-active", label: "Active", badge: "Plan only", disabled: true },
      { id: "tasks-completed", label: "Completed", badge: "Mock", disabled: true },
    ]},
    { id: "models",      label: "Models",       collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "models-active", label: "Active Model", badge: "Read-only", disabled: true },
      { id: "models-switch", label: "Switch Model", badge: "Soon", disabled: true },
    ]},
    { id: "permissions", label: "Permissions",  collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "permissions-tools", label: "Tool Access", badge: "Read-only", disabled: true },
      { id: "permissions-scope", label: "Scope", badge: "Read-only", disabled: true },
    ]},
    { id: "settings",    label: "Settings",     collapsible: true, defaultOpen: false, hidden: true, items: [
      { id: "settings-workspace", label: "Workspace", badge: "Soon", disabled: true },
      { id: "settings-context", label: "Context Window", badge: "Soon", disabled: true },
    ]},
  ],
};

AGENT_SIDEBAR_SECTIONS["chatbot-agent"] = [
  {
    id: "history",
    label: "History",
    defaultOpen: true,
    items: [
      { id: "history-today", label: "Today", badge: "Local", disabled: true, description: "Conversation history stored locally." },
      { id: "history-recent", label: "Recent", badge: "Local", disabled: true, description: "Recent conversations stored locally." },
    ],
  },
  {
    id: "threads",
    label: "Threads",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "threads-pinned", label: "Pinned", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "threads-shared", label: "Shared", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["finance-agent"] = [
  {
    id: "watchlist",
    label: "Watchlist",
    defaultOpen: true,
    items: [
      { id: "watchlist-symbols", label: "My Symbols", badge: "Local", disabled: true, description: "Watchlist data stored locally." },
      { id: "watchlist-add", label: "Add Symbol", badge: "Workspace", disabled: true, description: "Add symbols from the workspace." },
    ],
  },
  {
    id: "sectors",
    label: "Equity Sectors",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "sectors-tech", label: "Technology", disabled: true, description: "Sector overview not available in this workspace yet." },
      { id: "sectors-health", label: "Healthcare", disabled: true, description: "Sector overview not available in this workspace yet." },
      { id: "sectors-finance", label: "Financials", disabled: true, description: "Sector overview not available in this workspace yet." },
      { id: "sectors-energy", label: "Energy", disabled: true, description: "Sector overview not available in this workspace yet." },
      { id: "sectors-consumer", label: "Consumer", disabled: true, description: "Sector overview not available in this workspace yet." },
    ],
  },
  {
    id: "market",
    label: "Market Views",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "market-indices", label: "Indices", disabled: true, description: "Market index data not available yet." },
      { id: "market-movers", label: "Top Movers", badge: "Mock", disabled: true, description: "Top movers data (mock)." },
      { id: "market-summary", label: "Summary Feed", disabled: true, description: "Market summary feed not available yet." },
    ],
  },
  {
    id: "alerts",
    label: "Alerts",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "alerts-price", label: "Price Alerts", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "alerts-news", label: "News Alerts", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["academia-agent"] = [
  {
    id: "library",
    label: "Research Library",
    defaultOpen: true,
    items: [
      { id: "library-saved", label: "Saved Papers", badge: "Local", disabled: true, description: "Research library stored locally." },
      { id: "library-queue", label: "Reading Queue", badge: "Local", disabled: true, description: "Reading queue stored locally." },
      { id: "library-collections", label: "Collections", badge: "Local", disabled: true, description: "Collections stored locally." },
    ],
  },
  {
    id: "citations",
    label: "Citation Vault",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "citations-apa", label: "APA 7th", disabled: true, description: "Citation format not available yet." },
      { id: "citations-mla", label: "MLA 9th", disabled: true, description: "Citation format not available yet." },
      { id: "citations-chicago", label: "Chicago 17th", disabled: true, description: "Citation format not available yet." },
      { id: "citations-bibtex", label: "BibTeX", disabled: true, description: "Citation format not available yet." },
      { id: "citations-ieee", label: "IEEE", disabled: true, description: "Citation format not available yet." },
    ],
  },
  {
    id: "compare",
    label: "Compare Mode",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "compare-selected", label: "Selected Papers", disabled: true, description: "Compare mode not available yet." },
      { id: "compare-table", label: "Comparison Table", disabled: true, description: "Compare mode not available yet." },
    ],
  },
  {
    id: "search",
    label: "Search",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "search-saved", label: "Saved Searches", disabled: true, description: "Saved searches not available yet." },
      { id: "search-history", label: "History", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["real-estate-helper"] = [
  {
    id: "saved",
    label: "Saved Homes",
    defaultOpen: true,
    items: [
      { id: "saved-homes", label: "My Favorites", badge: "Local", disabled: true, description: "Saved homes stored locally." },
    ],
  },
  {
    id: "searches",
    label: "Searches",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "search-recent", label: "Recent Searches", badge: "Local", disabled: true, description: "Recent searches stored locally." },
      { id: "search-saved", label: "Saved Searches", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "alerts",
    label: "Alerts",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "alerts-price", label: "Price Drops", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "alerts-new", label: "New Listings", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["maps-agent"] = [
  {
    id: "places",
    label: "Places",
    defaultOpen: true,
    items: [
      { id: "places-saved", label: "Saved Places", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "places-recent", label: "Recent Searches", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "layers",
    label: "Layers",
    collapsible: true,
    defaultOpen: true,
    items: [
      { id: "layers-satellite", label: "Satellite", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "layers-terrain", label: "Terrain", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "layers-cities", label: "3D Cities", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "layers-labels", label: "Labels", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "layers-boundaries", label: "Boundaries", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "views",
    label: "Saved Views",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "views-saved", label: "Camera Views", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "data",
    label: "Data & Overlays",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "data-geojson", label: "GeoJSON", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "data-kml", label: "KML", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["product-scraper"] = [
  {
    id: "scrapes",
    label: "Scrape History",
    defaultOpen: true,
    items: [
      { id: "scrapes-recent", label: "Recent Scrapes", badge: "Local", disabled: true, description: "Recent scrapes stored locally." },
    ],
  },
  {
    id: "exports",
    label: "Exports",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "exports-json", label: "JSON Export", badge: "Playground", disabled: true, description: "Export feature not available yet." },
      { id: "exports-csv", label: "CSV Export", badge: "Playground", disabled: true, description: "Export feature not available yet." },
    ],
  },
  {
    id: "provider",
    label: "Provider",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "provider-status", label: "Scrape.do Status", badge: "Settings", disabled: true, description: "Provider status not available yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["job-search-agent"] = [
  {
    id: "search",
    label: "Search",
    defaultOpen: true,
    items: [
      { id: "search-open", label: "Job Search", badge: "Workspace", disabled: true, description: "Job search available in the workspace." },
      { id: "search-saved", label: "Saved Searches", badge: "Local", disabled: true, description: "Saved searches stored locally." },
    ],
  },
  {
    id: "tracker",
    label: "Applications",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "tracker-saved", label: "Saved Jobs", badge: "Local", disabled: true, description: "Saved jobs stored locally." },
      { id: "tracker-status", label: "Tracker", badge: "Local", disabled: true, description: "Application tracker stored locally." },
    ],
  },
  {
    id: "resume",
    label: "Resume Match",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "resume-match", label: "Match Score", badge: "Local", disabled: true, description: "Resume matching stored locally." },
      { id: "resume-profile", label: "Resume Profile", badge: "Local", disabled: true, description: "Resume profile stored locally." },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "insights-companies", label: "Companies", badge: "Route", disabled: true, description: "Company insights not available yet." },
      { id: "insights-salaries", label: "Salaries", badge: "Route", disabled: true, description: "Salary insights not available yet." },
      { id: "insights-alerts", label: "Alerts", badge: "Preview", disabled: true, description: "Job alerts not available yet." },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "settings-provider", label: "Provider Status", badge: "Settings", disabled: true, description: "Provider settings not available yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["travel-agent"] = [
  {
    id: "stays",
    label: "Stays",
    defaultOpen: true,
    items: [
      { id: "stays-search", label: "Stay Search", badge: "Route", disabled: true, description: "Stay search available in the workspace." },
      { id: "stays-detail", label: "Selected Stay", badge: "Workspace", disabled: true, description: "Selected stay details in the workspace." },
    ],
  },
  {
    id: "trips",
    label: "Saved Trips",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "trips-draft", label: "Draft Trips", badge: "Local", disabled: true, description: "Draft trips stored locally." },
      { id: "trips-saved", label: "Saved Stays", badge: "Local", disabled: true, description: "Saved stays stored locally." },
    ],
  },
  {
    id: "compare",
    label: "Compare",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "compare-options", label: "Stay Compare", badge: "Local", disabled: true, description: "Compare feature not available yet." },
    ],
  },
  {
    id: "itinerary",
    label: "Itinerary",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "itinerary-builder", label: "Planner", badge: "Local", disabled: true, description: "Itinerary planner not available yet." },
    ],
  },
  {
    id: "explore",
    label: "Explore",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "explore-deals", label: "Deals", badge: "Preview", disabled: true, description: "Travel deals not available yet." },
      { id: "explore-help", label: "Help", badge: "Guide", disabled: true, description: "Travel guide not available yet." },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "settings-provider", label: "Provider Status", badge: "Settings", disabled: true, description: "Provider settings not available yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["shipping-agent"] = [
  {
    id: "create-label",
    label: "Create Label",
    defaultOpen: true,
    items: [
      { id: "label-new", label: "New Label", badge: "Workspace", disabled: true, description: "Create a label in the workspace." },
    ],
  },
  {
    id: "shipments",
    label: "Shipments",
    defaultOpen: false,
    items: [
      { id: "shipments-all", label: "All Shipments", badge: "Workspace", disabled: true, description: "View shipments in the workspace." },
    ],
  },
  {
    id: "addresses",
    label: "Address Book",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "address-recipients", label: "Recipients", badge: "Local", disabled: true, description: "Address book stored locally." },
      { id: "address-sender", label: "Sender & Return", badge: "Local", disabled: true, description: "Address book stored locally." },
    ],
  },
  {
    id: "packages",
    label: "Packages",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "packages-presets", label: "Package Presets", badge: "Local", disabled: true, description: "Package presets stored locally." },
    ],
  },
  {
    id: "carriers",
    label: "Carriers",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "carriers-list", label: "Available Carriers", badge: "Preview", disabled: true, description: "Carrier list not available yet." },
    ],
  },
  {
    id: "printing",
    label: "Printing",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "printing-settings", label: "Print Settings", badge: "Local", disabled: true, description: "Print settings stored locally." },
    ],
  },
  {
    id: "tracking",
    label: "Tracking",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "tracking-search", label: "Track Shipment", badge: "Workspace", disabled: true, description: "Track shipments in the workspace." },
      { id: "tracking-recent", label: "Recent", badge: "Local", disabled: true, description: "Recent tracking stored locally." },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "analytics-spend", label: "Spend", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "settings-provider", label: "Provider Status", badge: "Settings", disabled: true, description: "Provider settings not available yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["computer-use-agent"] = [
  {
    id: "session",
    label: "Session",
    defaultOpen: true,
    items: [
      { id: "session-active", label: "Active Run", badge: "Workspace", disabled: true, description: "Active run available in the workspace." },
      { id: "session-history", label: "Run History", badge: "Local", disabled: true, description: "Run history stored locally." },
    ],
  },
  {
    id: "permissions",
    label: "Permissions",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "permissions-scope", label: "Permission Scope", badge: "Preview", disabled: true, description: "Permission settings not available yet." },
      { id: "permissions-domains", label: "Domain Allowlist", badge: "Preview", disabled: true, description: "Domain allowlist not available yet." },
    ],
  },
  {
    id: "environment",
    label: "Environment",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "environment-mode", label: "Browser Sandbox", badge: "Mock", disabled: true, description: "Browser sandbox (mock)." },
      { id: "environment-viewport", label: "Viewport Settings", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "artifacts",
    label: "Artifacts",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "artifacts-screenshots", label: "Screenshots", badge: "Mock", disabled: true, description: "Screenshots (mock)." },
      { id: "artifacts-replay", label: "Replay", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["media-agent"] = [
  {
    id: "explore",
    label: "Explore",
    defaultOpen: true,
    items: [
      { id: "explore-trending", label: "Trending", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "explore-discover", label: "Discover", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "library",
    label: "Library",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "library-assets", label: "My Assets", badge: "Local", disabled: true, description: "Media library stored locally." },
      { id: "library-recents", label: "Recent", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "projects-active", label: "Active", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "projects-templates", label: "Templates", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "models",
    label: "Media Models",
    collapsible: true,
    defaultOpen: false,
    hidden: true,
    items: [
      { id: "models-image", label: "Image Models", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "models-video", label: "Video Models", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
      { id: "models-audio", label: "Audio Models", badge: "Soon", disabled: true, description: "Not available in this workspace yet." },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    collapsible: true,
    defaultOpen: false,
    items: [
      { id: "settings-provider", label: "Provider Status", badge: "Settings", disabled: true, description: "Provider settings not available yet." },
    ],
  },
];

AGENT_SIDEBAR_SECTIONS["globe-agent"] = AGENT_SIDEBAR_SECTIONS["maps-agent"];

export function getAgentSidebarSections(agentSlug: string): AgentSidebarSection[] {
  return AGENT_SIDEBAR_SECTIONS[agentSlug] ?? [];
}
