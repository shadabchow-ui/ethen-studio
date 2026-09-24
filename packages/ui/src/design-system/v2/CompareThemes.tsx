"use client";

import type { ReactNode } from "react";

type CompareThemesProps = {
  /** Identical specimen to render in both themes — geometry stays identical, only tokens change. */
  children: ReactNode;
  /** Optional render function for theme-aware specimens that need to read theme without duplicating logic. */
  render?: never;
} | {
  children?: never;
  render: (theme: "light" | "dark") => ReactNode;
  /** Optional aria label override. */
  label?: string;
};

/**
 * Reusable Compare Themes wrapper — renders the exact same specimen/content/geometry
 * side by side with only the theme changed. No duplicated component logic.
 * Uses isolated `data-ethen-v2 data-v2-theme` scopes so Lab and V2 primitives resolve tokens locally.
 */
export function V2CompareThemes(props: CompareThemesProps & { label?: string; className?: string }) {
  const contentLight =
    "render" in props && typeof props.render === "function" ? props.render("light") : props.children;
  const contentDark =
    "render" in props && typeof props.render === "function" ? props.render("dark") : props.children;

  return (
    <div className={props.className ?? "dl2-theme-compare"} aria-label={props.label ?? "Light and dark identical-geometry comparison"}>
      <section className="dl2-theme-compare__frame" data-ethen-v2 data-v2-theme="light">
        <span className="dl2-theme-compare__label">LIGHT · same geometry</span>
        <div className="dl2-theme-compare__body">{contentLight}</div>
      </section>
      <section className="dl2-theme-compare__frame" data-ethen-v2 data-v2-theme="dark">
        <span className="dl2-theme-compare__label">DARK · same geometry</span>
        <div className="dl2-theme-compare__body">{contentDark}</div>
      </section>
    </div>
  );
}

/** Alias for lab imports. */
export const CompareThemes = V2CompareThemes;