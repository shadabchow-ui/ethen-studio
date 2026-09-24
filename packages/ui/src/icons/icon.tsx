import { cloneElement, type ReactElement, type ReactNode } from "react";
import { NAV_ICONS } from "./icons";
import type { IconProps } from "./index";

/**
 * EDS icon renderer. Decorative by default (`aria-hidden`); pass `label` for
 * meaningful icons. `currentColor` throughout — an icon never names a colour.
 *
 * Registry entries are complete `<svg>` elements, so the renderer clones the
 * entry with the requested size instead of nesting a second `<svg>` inside it.
 */
export function Icon({ name, size = 16, label, className, style }: IconProps): ReactNode {
  return cloneElement(NAV_ICONS[name] as ReactElement<React.SVGProps<SVGSVGElement>>, {
    width: size,
    height: size,
    className,
    style,
    ...(label === undefined ? { "aria-hidden": true } : { "aria-hidden": undefined, role: "img" }),
    ...(label === undefined ? null : { "aria-label": label }),
  });
}
