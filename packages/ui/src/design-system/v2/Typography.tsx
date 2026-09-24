import { cn } from "../../lib/utils";

type V2TypographyProps = React.HTMLAttributes<HTMLElement> & {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div" | "code";
};

/** PageTitle — 20px / 600 — primary page identity */
export function V2PageTitle({ as: Tag = "h1", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-page-title", className)} {...props} />;
}

/** SectionTitle — 16px / 600 — high-level sections */
export function V2SectionTitle({ as: Tag = "h2", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-section-title", className)} {...props} />;
}

/** UI — 14px / 400 — main dashboard text */
export function V2UI({ as: Tag = "p", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-ui", className)} {...props} />;
}

/** UIMedium — 14px / 500 — nav, labels, controls */
export function V2UIMedium({ as: Tag = "span", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-ui-medium", className)} {...props} />;
}

/** Secondary — 13px */
export function V2Secondary({ as: Tag = "span", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-secondary", className)} {...props} />;
}

/** Metadata — 12px */
export function V2Metadata({ as: Tag = "span", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-metadata", className)} {...props} />;
}

/** Code — 13–14px Geist Mono */
export function V2Code({ as: Tag = "code", className, ...props }: V2TypographyProps) {
  return <Tag className={cn("v2-code", className)} {...props} />;
}
