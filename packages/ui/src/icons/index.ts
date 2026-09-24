// Ethen shell icon registry — public surface for D05-A (extraction) and D05-B (drawing rules).
import type { CSSProperties } from "react";
import type { IconName } from "./icons";

export { NAV_ICONS, getNavIcon } from "./icons";
export type { IconName } from "./icons";
export { Icon } from "./icon";

export const ICON_NAMES: readonly IconName[] = [
  "compose",
  "grid",
  "star",
  "clock",
  "folder",
  "sessions",
  "settings",
  "billing",
  "project",
  "files",
  "search",
  "git",
  "tasks",
  "models",
  "permissions",
  "sparkle",
  "plus",
  "chats",
  "terminal",
  "shield",
  "authority",
  "receipt",
  "evidence",
  "verification",
  "judgement",
  "ground-truth",
  "thread",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "close",
  "check",
];

export type IconSize = 16 | 20 | 24;

export type IconProps = Readonly<{
  name: IconName;
  size?: IconSize;
  /** Meaningful icons carry a label; decorative icons omit it and stay hidden. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}>;
