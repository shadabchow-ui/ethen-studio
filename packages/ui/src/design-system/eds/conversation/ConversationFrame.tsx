"use client";

/**
 * EDS ConversationFrame — D10 candidate.
 *
 * One canonical conversation surface in two registers: prose (narrative
 * reading measure) and work (operational working rhythm). Messages arrive
 * through the caller-provided message slot; the real D08 Composer anchors
 * the conversation boundary through the composer slot. Draft, message list,
 * and scroll state are caller-owned so Conversation/Work switching never
 * remounts the tree.
 *
 * Inherits the containing EDS surface scope (theme + density). Do not add
 * data-eds here: a bare scope re-declares Dark values and traps the theme.
 */
import * as React from "react";

export type ConversationVariant = "prose" | "work";

export interface ConversationFrameProps {
  variant: ConversationVariant;
  label?: string;
  messages: React.ReactNode;
  composer: React.ReactNode;
  statusRegion?: React.ReactNode;
  className?: string;
  id?: string;
}

export function ConversationFrame({
  variant,
  label = "Conversation",
  messages,
  composer,
  statusRegion,
  className,
  id,
}: ConversationFrameProps) {
  return (
    <section
      aria-label={label}
      id={id}
      className={["eds-conversation", `eds-conversation--${variant}`, className].filter(Boolean).join(" ")}
    >
      <div className="eds-conversation__messages" role="log" aria-label={`${label} messages`}>
        {messages}
      </div>
      {statusRegion}
      <div className="eds-conversation__composer">{composer}</div>
    </section>
  );
}
