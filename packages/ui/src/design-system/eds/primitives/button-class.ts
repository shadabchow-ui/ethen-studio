/**
 * EDS button class composition (dependency-free: no React, no icons).
 *
 * Consumer classes EXTEND the base — spreading a caller `className` after the
 * computed one used to erase the base, variant, density, focus, disabled and
 * loading behavior entirely.
 */
import type { EdsButtonDensity, EdsButtonVariant } from "./Button";

const VARIANT_CLASS: Record<EdsButtonVariant, string> = {
  primary: "",
  secondary: "eds-button--secondary",
  quiet: "eds-button--quiet",
  destructive: "eds-button--destructive",
};

export function edsButtonClassName(
  variant: EdsButtonVariant,
  density: EdsButtonDensity,
  isLoading: boolean,
  className?: string,
): string {
  return [
    "eds-button",
    VARIANT_CLASS[variant],
    density === "compact" ? "eds-button--compact" : "",
    isLoading ? "eds-button--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
