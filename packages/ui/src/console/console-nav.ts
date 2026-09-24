/**
 * CONSOLE_A1 — the Console navigation architecture, as data.
 *
 * Seven visible entries at rest (spec §7: "avoid more than roughly 7 top-level
 * visual groups"). Two are destinations, five are groups that stay CLOSED until
 * the active page is inside them or the user opens them. Forty-one destinations
 * are reachable, but the rail only ever shows the ones that earn the row.
 *
 * `route` is the conceptual destination from spec §133. Nothing in this lab
 * navigates: the Console is not wired to a runtime and platform.upcube.ai is not
 * deployed. The routes exist so the command palette can name real destinations
 * instead of inventing them, and so the eventual runtime integration inherits
 * one route map rather than re-deriving it from the markup.
 */
import type { ConsoleIconName } from "./console-icons";

export type ConsoleDestination = Readonly<{
  id: string;
  label: string;
  icon: ConsoleIconName;
  route: string;
  /** Where the command palette files this destination. */
  group: string;
  badge?: "New" | "Beta";
}>;

export type ConsoleNavEntry =
  | Readonly<{ kind: "destination"; destination: ConsoleDestination }>
  | Readonly<{ kind: "group"; id: string; label: string; icon: ConsoleIconName; items: readonly ConsoleDestination[] }>;

const d = (
  id: string,
  label: string,
  icon: ConsoleIconName,
  route: string,
  group: string,
  badge?: ConsoleDestination["badge"],
): ConsoleDestination => ({ id, label, icon, route, group, badge });

export const CONSOLE_NAV: readonly ConsoleNavEntry[] = [
  { kind: "destination", destination: d("dashboard", "Dashboard", "dashboard", "/dashboard", "Home") },
  { kind: "destination", destination: d("projects", "Projects", "projects", "/projects", "Home") },
  {
    kind: "group",
    id: "build",
    label: "Build",
    icon: "build",
    items: [
      d("playground", "Playground", "playground", "/playground", "Build"),
      d("research", "Research", "research", "/research", "Build"),
      d("code", "Code", "code", "/code", "Build"),
      d("computer", "Computer", "computer", "/computer", "Build"),
      d("studio", "Studio", "studio", "/studio", "Build"),
      d("voice", "Voice", "voice", "/voice", "Build"),
      d("flow", "Flow", "flow", "/flow", "Build"),
      d("designer", "Designer", "designer", "/designer", "Build"),
      d("founder", "Founder", "founder", "/founder", "Build"),
    ],
  },
  {
    kind: "group",
    id: "agents",
    label: "Agents & Automation",
    icon: "agents",
    items: [
      d("agents-index", "Agents", "agents", "/agents", "Agents"),
      d("runs", "Runs", "runs", "/runs", "Agents"),
      d("deployments", "Deployments", "deployments", "/deployments", "Agents"),
      d("environments", "Environments", "environments", "/environments", "Agents"),
      d("sentinel", "Sentinel", "sentinel", "/sentinel", "Agents"),
    ],
  },
  {
    kind: "group",
    id: "models",
    label: "Models & Infrastructure",
    icon: "model-intelligence",
    items: [
      d("model-intelligence", "Model Intelligence", "model-intelligence", "/models", "Models"),
      d("gateway", "AI Gateway", "gateway", "/gateway", "Models"),
      d("compute", "Compute", "compute", "/compute", "Models"),
      d("local-models", "Local Models", "local-models", "/local-models", "Models"),
    ],
  },
  {
    kind: "group",
    id: "observe",
    label: "Observe",
    icon: "observe",
    items: [
      d("usage", "Usage", "usage", "/analytics/usage", "Observe"),
      d("costs", "Costs", "costs", "/analytics/costs", "Observe"),
      d("logs", "Logs", "logs", "/analytics/logs", "Observe"),
      d("observability", "Observability", "observability", "/analytics/observability", "Observe"),
    ],
  },
  {
    kind: "group",
    id: "developer",
    label: "Developer",
    icon: "developer",
    items: [
      d("api-keys", "API keys", "api-keys", "/api-keys", "Developer"),
      d("files", "Files", "files", "/files", "Developer"),
      d("batches", "Batches", "batches", "/batches", "Developer"),
      d("credentials", "Credentials", "credentials", "/credentials", "Developer"),
      d("service-accounts", "Service accounts", "service-accounts", "/service-accounts", "Developer"),
      d("webhooks", "Webhooks", "webhooks", "/webhooks", "Developer"),
      d("integrations", "Integrations", "integrations", "/integrations", "Developer"),
    ],
  },
  {
    kind: "group",
    id: "manage",
    label: "Manage",
    icon: "manage",
    items: [
      d("workspaces", "Workspaces", "workspaces", "/settings/workspaces", "Manage"),
      d("members", "Members", "members", "/settings/members", "Manage"),
      d("billing", "Billing", "billing", "/settings/billing", "Manage"),
      d("limits", "Limits", "limits", "/settings/limits", "Manage"),
      d("security", "Security", "security", "/settings/security", "Manage"),
      d("org-settings", "Organization settings", "org-settings", "/settings/organization", "Manage"),
    ],
  },
];

/** Persistent secondary utilities. Never a group, never expandable. */
export const CONSOLE_UTILITIES: readonly ConsoleDestination[] = [
  d("notifications", "Notifications", "notifications", "/notifications", "Go to"),
  d("documentation", "Documentation", "documentation", "/docs", "Documentation"),
];

/** Every destination, flattened — the palette's navigation index. */
export const CONSOLE_DESTINATIONS: readonly ConsoleDestination[] = CONSOLE_NAV.flatMap((entry) =>
  entry.kind === "destination" ? [entry.destination] : entry.items,
).concat(CONSOLE_UTILITIES, [
  d("all-products", "All products", "manage", "/products", "Go to"),
]);

/** Which group, if any, owns a destination — the rail auto-opens it. */
export function groupOwning(destinationId: string): string | null {
  for (const entry of CONSOLE_NAV) {
    if (entry.kind === "group" && entry.items.some((item) => item.id === destinationId)) return entry.id;
  }
  return null;
}

export function destinationById(id: string): ConsoleDestination | undefined {
  return CONSOLE_DESTINATIONS.find((destination) => destination.id === id);
}
