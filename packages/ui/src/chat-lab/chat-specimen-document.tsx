"use client";

/**
 * CHAT_A1 — a standalone Chat specimen document.
 *
 * No board chrome at all: the specimen's own layout is the only thing in the
 * viewport, so a frame that declares 390px is reviewing a genuine 390px
 * document rather than a narrow div inside a wide window. Each specimen
 * already owns its full-height surface, so this adds nothing around it.
 */
import * as React from "react";
import { chatSpecimenById, type ChatSpecimenTheme } from "./chat-specimen-registry";

export function ChatSpecimenDocument({
  specimenId,
  theme,
}: {
  specimenId: string;
  theme: ChatSpecimenTheme;
}) {
  const specimen = chatSpecimenById(specimenId);
  if (!specimen) return null;
  return <>{specimen.render(theme)}</>;
}
