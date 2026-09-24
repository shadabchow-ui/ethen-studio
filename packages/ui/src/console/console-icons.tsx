/**
 * CONSOLE_A1 — the Console mark set.
 *
 * The shared registry (`components/icons`) owns the production marks and is NOT
 * edited here: a Console-local need must not push visual drift into every shell
 * that already ships those icons. So the Console DELEGATES to the registry for
 * every mark it already carries (project, files, search, settings, billing,
 * models, shield, permissions, plus, close, check, chevrons, clock, chats,
 * folder, terminal) and draws the rest under the same published rules —
 * `components/icons/ICON_RULES.md`:
 *
 *   24-unit grid · 1.5px uniform stroke · butt caps · miter joins ·
 *   corner radius ≤ 2 · stroke-only · currentColor · legible at 16px
 *
 * Deliberately NOT copied from the reference: no rounded-cap icon family, no
 * duotone glyphs, no product mascots. Ethen marks read as instruments — a dial,
 * a gate, a gutter, a track with a stop.
 */
import * as React from "react";
import { Icon, type IconName } from "@ethen/ui/icons";

export type ConsoleIconName =
  // navigation — home
  | "dashboard"
  | "projects"
  // navigation — build
  | "build"
  | "playground"
  | "research"
  | "code"
  | "computer"
  | "studio"
  | "voice"
  | "flow"
  | "designer"
  | "founder"
  // navigation — agents & automation
  | "agents"
  | "runs"
  | "deployments"
  | "environments"
  | "sentinel"
  // navigation — models & infrastructure
  | "model-intelligence"
  | "gateway"
  | "compute"
  | "local-models"
  // navigation — observe
  | "observe"
  | "usage"
  | "costs"
  | "logs"
  | "observability"
  // navigation — developer
  | "developer"
  | "api-keys"
  | "files"
  | "batches"
  | "credentials"
  | "service-accounts"
  | "webhooks"
  | "integrations"
  // navigation — manage
  | "manage"
  | "workspaces"
  | "members"
  | "billing"
  | "limits"
  | "security"
  | "org-settings"
  // utilities
  | "notifications"
  | "documentation"
  | "chat"
  // chrome
  | "rail"
  | "search"
  | "more"
  | "plus"
  | "external"
  | "close"
  | "check"
  | "copy"
  | "filter"
  | "download"
  | "refresh"
  | "warning"
  | "info"
  | "menu"
  | "workspace"
  | "rise"
  | "fall"
  | "back"
  | "sort"
  | "calendar"
  | "reveal"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left";

/** Marks the shared registry already draws. Reuse, never redraw. */
const DELEGATED: Partial<Record<ConsoleIconName, IconName>> = {
  projects: "project",
  files: "files",
  search: "search",
  "org-settings": "settings",
  billing: "billing",
  "model-intelligence": "models",
  sentinel: "shield",
  security: "permissions",
  plus: "plus",
  close: "close",
  check: "check",
  chat: "chats",
  "chevron-down": "chevron-down",
  "chevron-right": "chevron-right",
  "chevron-left": "chevron-left",
};

/** Marks drawn for the Console, because the registry has no equivalent. */
const PATHS: Partial<Record<ConsoleIconName, React.ReactNode>> = {
  // A dial and its needle — the console reads state off an instrument.
  dashboard: <><path d="M4 18a8 8 0 0 1 16 0" /><path d="M4 18h16" /><path d="m12 18 4.5-6.5" /></>,
  // Build — a bench with a work line raised above it.
  build: <><path d="M4 19h16" /><path d="M7 19v-5h10v5" /><path d="m9 10 3-4 3 4" /></>,
  // Playground — three calibration sliders. Parameters, not a toy.
  playground: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /><path d="M9 5v4" /><path d="M15 10v4" /><path d="M7 15v4" /></>,
  // Research — a lens held over a document.
  research: <><path d="M5 3.5h9l4 4v4" /><path d="M14 3.5v4h4" /><path d="M5 3.5v17h5" /><circle cx="15" cy="15.5" r="4" /><path d="m18 18.5 2.5 2.5" /></>,
  code: <><path d="m9 9-3.5 3L9 15" /><path d="m15 9 3.5 3L15 15" /><path d="M13.5 6.5 11 17.5" /></>,
  // Computer — a screen and a driven pointer.
  computer: <><rect x="3.5" y="4.5" width="17" height="12" /><path d="M12 16.5V20" /><path d="M9 20h6" /><path d="m10 7.5 5 3-2.2 1.1 1.2 2.2-1.6.8-1.2-2.2-1.2 1.4V7.5Z" /></>,
  // Studio — a film gate: a frame ruled into cells.
  studio: <><rect x="3.5" y="5.5" width="17" height="13" /><path d="M3.5 9.5h17" /><path d="M3.5 14.5h17" /><path d="M8.5 5.5v13" /><path d="M15.5 5.5v13" /></>,
  // Voice — a level meter, not a speech bubble.
  voice: <><path d="M4 10v4" /><path d="M8 7v10" /><path d="M12 4v16" /><path d="M16 7v10" /><path d="M20 10v4" /></>,
  // Flow — nodes and the edges between them.
  flow: <><rect x="3.5" y="4" width="6" height="5" /><rect x="14.5" y="9.5" width="6" height="5" /><rect x="3.5" y="15" width="6" height="5" /><path d="M9.5 6.5h3V12h2" /><path d="M9.5 17.5h3V12" /></>,
  // Designer — an artboard and its guides.
  designer: <><rect x="6.5" y="6.5" width="11" height="11" /><path d="M4 6.5h16" /><path d="M4 17.5h16" /><path d="M6.5 4v16" /><path d="M17.5 4v16" /></>,
  // Founder — the company as a structure on a baseline.
  founder: <><path d="M4 20h16" /><path d="M6.5 20V9.5L12 5.5l5.5 4V20" /><path d="M10 20v-5h4v5" /></>,
  // Agents — a chassis carrying two sensors and a mast.
  agents: <><rect x="4.5" y="7.5" width="15" height="11" /><path d="M12 3.5v4" /><path d="M9 15h6" /><circle cx="9" cy="11.5" r="1.1" /><circle cx="15" cy="11.5" r="1.1" /></>,
  // Runs — a single trace across a time base.
  runs: <><path d="M4 20h16" /><path d="M4 12h3l2.5-6 3 12 2.5-6H20" /></>,
  // Deployments — a payload leaving a platform.
  deployments: <><path d="M4 20h16" /><path d="M12 4v12" /><path d="m7 9 5-5 5 5" /></>,
  // Environments — stacked, promotable layers.
  environments: <><path d="m12 3.5 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16.5 8 4 8-4" /></>,
  // Gateway — one ingress fanning to providers.
  gateway: <><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6.5" r="2" /><circle cx="18" cy="17.5" r="2" /><path d="m8 11.2 8-3.7" /><path d="m8 12.8 8 3.7" /></>,
  // Compute — a package with its pins.
  compute: <><rect x="7.5" y="7.5" width="9" height="9" /><path d="M10 4v3.5" /><path d="M14 4v3.5" /><path d="M10 16.5V20" /><path d="M14 16.5V20" /><path d="M4 10h3.5" /><path d="M4 14h3.5" /><path d="M16.5 10H20" /><path d="M16.5 14H20" /></>,
  // Local models — the package held inside a device.
  "local-models": <><rect x="3.5" y="5" width="17" height="12" /><path d="M8 20h8" /><path d="M12 17v3" /><rect x="9.5" y="9" width="5" height="4" /></>,
  // Observe — an aperture over a baseline.
  observe: <><circle cx="12" cy="12" r="7.5" /><path d="M4.5 12h15" /></>,
  // Usage — a plotted trend against two axes.
  usage: <><path d="M4 4v16h16" /><path d="m7 16 4-5 3 2.5L20 7" /></>,
  // Costs — the same axes, measured in bars.
  costs: <><path d="M4 4v16h16" /><path d="M8 20v-6" /><path d="M13 20V9" /><path d="M18 20v-4" /></>,
  // Logs — a gutter with entries running off it.
  logs: <><path d="M4 4.5v15" /><path d="M8 7h12" /><path d="M8 11h8" /><path d="M8 15h12" /><path d="M8 19h6" /></>,
  // Observability — a pulse read through a ring.
  observability: <><circle cx="12" cy="12" r="8" /><path d="M4.5 12h3l2-3.5 2.5 7 2-3.5h5.5" /></>,
  // Developer — a bracket pair around a rule.
  developer: <><path d="M8.5 5.5 4 12l4.5 6.5" /><path d="M15.5 5.5 20 12l-4.5 6.5" /></>,
  // API keys — a bit and its ward cuts.
  "api-keys": <><circle cx="7.5" cy="12" r="3.5" /><path d="M11 12h9" /><path d="M17 12v3.5" /><path d="M20 12v2.5" /></>,
  // Batches — work queued in equal units.
  batches: <><rect x="4.5" y="4.5" width="15" height="4" /><rect x="4.5" y="10" width="15" height="4" /><rect x="4.5" y="15.5" width="15" height="4" /></>,
  // Credentials — a shackle over a sealed body.
  credentials: <><rect x="3.5" y="9.5" width="17" height="10" /><path d="M8 9.5V6.5a4 4 0 0 1 8 0v3" /><path d="M12 13v3" /></>,
  // Service accounts — an identity that belongs to a machine.
  "service-accounts": <><rect x="3.5" y="4.5" width="17" height="15" /><circle cx="12" cy="10" r="2.5" /><path d="M7.5 17c1.1-2 2.7-3 4.5-3s3.4 1 4.5 3" /></>,
  // Webhooks — a call leaving the boundary.
  webhooks: <><path d="M10.5 4.5H4.5v15h15v-6" /><path d="M13.5 4.5H20V11" /><path d="m20 4.5-7.5 7.5" /></>,
  // Integrations — a coupling between two systems.
  integrations: <><rect x="3.5" y="9.5" width="7" height="5" /><rect x="13.5" y="9.5" width="7" height="5" /><path d="M10.5 12h3" /></>,
  // Manage — a governed set of surfaces.
  manage: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><path d="M13 16.5h7" /><path d="M16.5 13v7" /></>,
  // Workspaces — four bounded contexts.
  workspaces: <><rect x="3.5" y="3.5" width="7" height="7" /><rect x="13.5" y="3.5" width="7" height="7" /><rect x="3.5" y="13.5" width="7" height="7" /><rect x="13.5" y="13.5" width="7" height="7" /></>,
  members: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c1-3.2 3-4.8 5.5-4.8s4.5 1.6 5.5 4.8" /><path d="M15.5 6.2a3 3 0 0 1 0 4.6" /><path d="M16.5 14.6c1.7.8 2.9 2.2 3.5 4.4" /></>,
  // Limits — a track with a hard stop on it.
  limits: <><path d="M4 8v8" /><path d="M4 12h11" /><path d="M18 5.5v13" /></>,
  // Notifications — a bell drawn square-shouldered.
  notifications: <><path d="M6.5 17.5v-6a5.5 5.5 0 0 1 11 0v6" /><path d="M4.5 17.5h15" /><path d="M10 20.5h4" /></>,
  documentation: <><path d="M12 7.5v12.5" /><path d="M12 7.5C10.2 5.9 8 5 4.5 5v12c3.5 0 5.7.9 7.5 3" /><path d="M12 7.5C13.8 5.9 16 5 19.5 5v12c-3.5 0-5.7.9-7.5 3" /></>,
  // Rail — the pane the navigation lives in.
  rail: <><rect x="3.5" y="4.5" width="17" height="15" /><path d="M9.5 4.5v15" /></>,
  more: <><circle cx="12" cy="5.5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="18.5" r="1" /></>,
  external: <><path d="M14 5h5v5" /><path d="m19 5-7 7" /><path d="M18 14v5H5V6h5" /></>,
  copy: <><rect x="9" y="9" width="10" height="10" /><path d="M15 5H5v10" /></>,
  filter: <><path d="M4 6.5h16" /><path d="M7 12h10" /><path d="M10 17.5h4" /></>,
  download: <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 20h16" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4h-4" /></>,
  warning: <><path d="M12 4 21 20H3L12 4Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.2" r=".6" /></>,
  info: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".6" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  // Workspace — a bounded context, set on point.
  workspace: <><path d="m12 3.5 8.5 8.5L12 20.5 3.5 12 12 3.5Z" /></>,
  rise: <><path d="M12 20V5" /><path d="m6.5 10.5 5.5-5.5 5.5 5.5" /></>,
  fall: <><path d="M12 4v15" /><path d="m6.5 13.5 5.5 5.5 5.5-5.5" /></>,
  back: <><path d="M20 12H4" /><path d="M10.5 5.5 4 12l6.5 6.5" /></>,
  sort: <><path d="M7 4.5v15" /><path d="m3.5 16 3.5 3.5L10.5 16" /><path d="M17 19.5v-15" /><path d="m13.5 8 3.5-3.5L20.5 8" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" /><path d="M3.5 10h17" /><path d="M8 3.5v4" /><path d="M16 3.5v4" /></>,
  // Reveal — an aperture opened over a subject.
  reveal: <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
};

export function ConsoleIcon({
  name,
  size = 16,
  label,
  className,
}: {
  name: ConsoleIconName;
  size?: number;
  /** Meaningful icons carry a label; decorative icons stay hidden. */
  label?: string;
  className?: string;
}) {
  const delegated = DELEGATED[name];
  if (delegated) {
    return (
      <Icon
        name={delegated}
        size={size === 20 ? 20 : size === 24 ? 24 : 16}
        label={label}
        className={className}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      className={className}
      aria-hidden={label === undefined ? true : undefined}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Every mark the Console can render — drawn locally or delegated. */
export const CONSOLE_ICON_NAMES: readonly ConsoleIconName[] = [
  ...(Object.keys(PATHS) as ConsoleIconName[]),
  ...(Object.keys(DELEGATED) as ConsoleIconName[]),
];
