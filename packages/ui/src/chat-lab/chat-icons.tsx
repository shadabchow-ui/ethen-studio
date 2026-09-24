/**
 * CHAT_A1 — the marks Ethen Chat needs that the EDS registry does not carry.
 *
 * The shared registry (`components/icons`) owns the twenty-seven production
 * marks and is NOT edited here: a Chat-local need must not force visual drift
 * into every shell that already ships those icons. So Chat reuses the registry
 * for everything it already has (plus, search, folder, files, chevrons, close,
 * check, settings, clock, sparkle) and draws only the missing marks below,
 * under the same published rules — `components/icons/ICON_RULES.md`:
 *
 *   24-unit grid · 1.5px uniform stroke · butt caps · miter joins ·
 *   corner radius ≤ 2 · stroke-only · currentColor · legible at 16px
 *
 * Deliberately NOT copied from the reference: no starburst, no brand glyph,
 * no rounded-cap icon family. Ethen marks read as instruments.
 */
import * as React from "react";

export type ChatIconName =
  | "send"
  | "stop"
  | "mic"
  | "tools"
  | "more"
  | "pin"
  | "copy"
  | "retry"
  | "good"
  | "bad"
  | "external"
  | "panel"
  | "menu"
  | "image"
  | "document"
  | "code"
  | "globe"
  | "sources"
  | "remove"
  | "back";

const PATHS: Record<ChatIconName, React.ReactNode> = {
  // send — a plumb arrow, not a paper plane
  send: <><path d="M12 19V5" /><path d="M5.5 11.5 12 5l6.5 6.5" /></>,
  // stop — a square aperture closed
  stop: <rect x="7.5" y="7.5" width="9" height="9" />,
  // mic — a capsule on a stand, drawn square-shouldered
  mic: <><path d="M12 4h0a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 12 14a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 12 4Z" /><path d="M6.5 11.5A5.5 5.5 0 0 0 17.5 11.5" /><path d="M12 14v6" /><path d="M8.5 20h7" /></>,
  // tools — three calibration sliders: an instrument panel
  tools: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /><path d="M9 5v4" /><path d="M15 10v4" /><path d="M7 15v4" /></>,
  more: <><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></>,
  // pin — a survey pin driven into a baseline
  pin: <><path d="M12 14v6" /><path d="M8 4h8l-1.5 6 2.5 2.5h-10L9.5 10 8 4Z" /></>,
  copy: <><rect x="9" y="9" width="10" height="10" /><path d="M15 5H5v10" /></>,
  retry: <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4h-4" /></>,
  good: <><path d="M8 20V10l4-6 1.5 1v5H20l-1.5 10H8Z" /><path d="M8 10H4v10h4" /></>,
  bad: <><path d="M16 4v10l-4 6-1.5-1v-5H4l1.5-10H16Z" /><path d="M16 14h4V4h-4" /></>,
  external: <><path d="M14 5h5v5" /><path d="M19 5l-7 7" /><path d="M18 14v5H5V6h5" /></>,
  panel: <><rect x="3.5" y="4.5" width="17" height="15" /><path d="M14 4.5v15" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" /><path d="m3.5 16 4.5-4.5 4 4 3-3 5 5" /><circle cx="9" cy="9" r="1.25" /></>,
  document: <><path d="M6 3.5h8l4 4v13H6Z" /><path d="M14 3.5v4h4" /><path d="M9 12h6" /><path d="M9 15.5h6" /></>,
  code: <><path d="m9 9-3.5 3L9 15" /><path d="m15 9 3.5 3L15 15" /><path d="M13.5 6.5 11 17.5" /></>,
  globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16" /><path d="M12 4c2.4 2.6 2.4 12.4 0 16-2.4-3.6-2.4-13.4 0-16Z" /></>,
  // sources — a lens over a stacked ground line
  sources: <><circle cx="10.5" cy="10.5" r="5" /><path d="m14.5 14.5 4.5 4.5" /><path d="M4 18h6" /><path d="M4 21h10" /></>,
  remove: <><path d="m6.5 6.5 11 11" /><path d="m17.5 6.5-11 11" /></>,
  back: <><path d="M20 12H4" /><path d="m10.5 5.5-6.5 6.5 6.5 6.5" /></>,
};

export function ChatIcon({
  name,
  size = 16,
  label,
  className,
}: {
  name: ChatIconName;
  size?: number;
  /** Meaningful icons carry a label; decorative icons stay hidden. */
  label?: string;
  className?: string;
}) {
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

export const CHAT_ICON_NAMES = Object.keys(PATHS) as readonly ChatIconName[];
