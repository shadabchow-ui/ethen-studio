"use client";

/**
 * CHAT_A1 — the backdrop a component-level specimen sits on.
 *
 * Shell specimens bring their own token scope; a specimen that reviews ONE
 * component (the composer, a menu, the activity trail) still needs the same
 * `data-ethen-chat` scope and the same canvas, or it would be reviewed against
 * a surface the product never shows it on.
 */
import * as React from "react";
import styles from "./chat-specimen-surface.module.css";

export function ChatSpecimenSurface({
  theme = "system",
  children,
  align = "center",
  note,
}: {
  theme?: "system" | "light" | "dark";
  children: React.ReactNode;
  align?: "center" | "top";
  note?: string;
}) {
  return (
    <div
      className={styles.surface}
      data-ethen-chat
      data-eds
      data-eds-theme={theme}
      data-eds-density="work"
      data-align={align}
    >
      <div className={styles.inner}>{children}</div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}

export function SpecimenCase({
  label,
  detail,
  headroom = false,
  children,
}: {
  label: string;
  detail?: string;
  /**
   * A case whose menu opens UPWARD needs room above it, or the popup is
   * clipped by the viewport and the specimen shows a truncated menu — the one
   * thing it exists to show. This reserves that room instead of moving the
   * menu, which would make the board lie about the product's placement.
   */
  headroom?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.case} data-headroom={headroom ? "true" : undefined} aria-label={label}>
      <header className={styles.caseHeader}>
        <h2>{label}</h2>
        {detail ? <p>{detail}</p> : null}
      </header>
      <div className={styles.caseBody}>{children}</div>
    </section>
  );
}
