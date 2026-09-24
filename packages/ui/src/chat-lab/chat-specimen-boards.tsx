"use client";

/**
 * CHAT_A1 — the component-level specimens (CHAT-03…09, 13, 14, 21).
 *
 * These are the SAME components the shell mounts, shown on the same canvas at
 * a real viewport. Nothing here re-implements a control for display: a board
 * that draws its own version of the composer is reviewing a picture.
 */
import * as React from "react";
import { ArtifactPanel } from "./artifact-panel";
import { ChatComposer } from "./chat-composer";
import { ChatSidebar } from "./chat-sidebar";
import { SourceTray, ToolActivity } from "./conversation-thread";
import { ChatSpecimenSurface, SpecimenCase } from "./chat-specimen-surface";
import {
  CHAT_ATTACHMENTS,
  CHAT_ERRORS,
  CHAT_HISTORY,
  CHAT_HISTORY_DENSE,
  SOURCE_TRAY,
  TOOL_ACTIVITY_STEPS,
} from "./chat-fixtures";
import styles from "./chat-specimen-boards.module.css";

type Theme = "system" | "light" | "dark";

function RailCase({ children }: { children: React.ReactNode }) {
  return <div className={styles.railCase}>{children}</div>;
}

/** CHAT-03 — the rail with projects, and the pinned-projects empty state. */
export function SidebarFullBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="The rail is the only surface that sits BELOW the canvas tone. Hover steps up toward the canvas; the active row steps once further and is the only row that changes text colour.">
      <div className={styles.railRow}>
        <SpecimenCase label="CHAT-03 · Rail" detail="Four primary items. No flagship product ever appears here.">
          <RailCase>
            <ChatSidebar history={CHAT_HISTORY} activeChatId="c2" activeProjectId="ethen-v5" />
          </RailCase>
        </SpecimenCase>
        <SpecimenCase label="CHAT-03 · Pinned projects empty" detail="Muted hint, never an empty-state card.">
          <RailCase>
            <ChatSidebar history={CHAT_HISTORY} projectsEmpty />
          </RailCase>
        </SpecimenCase>
      </div>
    </ChatSpecimenSurface>
  );
}

/** CHAT-04 — a history long enough to scroll, group and truncate. */
export function SidebarDenseBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="Twenty-three conversations across four groups. The rail scrolls independently; brand, primary actions and the account area never move.">
      <SpecimenCase label="CHAT-04 · Rail, dense history" detail="Titles truncate at one line; `…` appears on hover AND on keyboard focus.">
        <RailCase>
          <ChatSidebar history={CHAT_HISTORY_DENSE} activeChatId="d4" />
        </RailCase>
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-05 — the composer at rest. */
export function ComposerEmptyBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} note="680px, ~86px collapsed, one hairline, 16px radius, almost no shadow. Send is quiet and disabled until there is something to send.">
      <SpecimenCase label="CHAT-05 · Composer, empty" detail="Type to see it grow; Enter sends, Shift+Enter adds a line.">
        <ChatComposer />
      </SpecimenCase>
      <SpecimenCase label="CHAT-05 · Composer, ready" detail="Send takes the Ethen accent only once the turn can actually be sent.">
        <ChatComposer initialValue="Review the D18A Public Foundation board and tell me what still feels generic." />
      </SpecimenCase>
      <SpecimenCase label="CHAT-05 · Composer, generating" detail="The same control becomes Stop. No second button appears.">
        <ChatComposer initialValue="" generating />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-05 — the composer grown tall: wrapping, internal scroll, footer intact. */
export function ComposerMultilineBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} note="A long draft wraps to the visible-viewport cap (32dvh backstop) and then scrolls inside itself. Footer controls never move.">
      <SpecimenCase label="CHAT-05 · Composer, multiline" detail="Grows, caps, then scrolls — geometry holds.">
        <ChatComposer
          initialValue={"Review the D18A Public Foundation board.\n\nThree areas are drifting:\n1. The family vocabulary is not load-bearing.\n2. Section rhythm is uniform where it should be argued.\n3. The accent is doing decoration, not signalling.\n\nStart with Decision pages and report back before touching anything else."}
        />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-06 — attachments and the attachment menu. */
export function ComposerAttachmentsBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="Attachment tiles live INSIDE the composer, scroll horizontally, and each carries an accessible remove control naming its file.">
      <SpecimenCase label="CHAT-06 · Attachments" detail="Ready, uploading and failed, in one strip.">
        <ChatComposer initialAttachments={CHAT_ATTACHMENTS} initialValue="Compare these against the approved homepage baseline." />
      </SpecimenCase>
      <SpecimenCase label="CHAT-06 · Attachment menu" detail="Four destinations, no permanent inline labels." headroom>
        <ChatComposer initialMenu="attach" />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-07 — an active tool, shown as a removable token. */
export function ComposerToolActiveBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} note="Active tools are small removable tokens above the input — not five permanent pills in the footer.">
      <SpecimenCase label="CHAT-07 · One tool active" detail="Web is on; the footer still carries a single Tools control.">
        <ChatComposer initialTools={["web"]} initialValue="Find every public page that still links to the retired model directory." />
      </SpecimenCase>
      <SpecimenCase label="CHAT-07 · Two tools active" detail="Tokens wrap; the composer geometry does not change.">
        <ChatComposer initialTools={["deep-research", "code"]} />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-08 — one selected model, intelligence level inside the same menu. */
export function ModelSelectorBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="Current model first, intelligence second, other models last — radio semantics throughout, so speed/depth naming never competes. A pick applies to the next submission, never a live run. Model names are design-lab placeholders — no Ethen model-naming authority exists in the repository yet.">
      <SpecimenCase label="CHAT-08 · Model menu" detail="No provider logos, no rainbow, one selected name." headroom>
        <ChatComposer initialMenu="model" />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-09 — the tools menu. */
export function ToolsMenuBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="Each tool names the Ethen surface it would bind to at runtime integration (lib/research, lib/cortex-ultra, lib/coding, lib/computer-use, lib/media). Nothing executes in the lab and the menu says so.">
      <SpecimenCase label="CHAT-09 · Tools menu" detail="Multi-select; selected tools become tokens above the input." headroom>
        <ChatComposer initialMenu="tools" initialTools={["web"]} />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-13 — execution state, never chain-of-thought. */
export function ToolActivityBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="Only execution state is ever rendered: what ran, how much it read, how long it took. There is no code path in this component that could print private reasoning.">
      <SpecimenCase label="CHAT-13 · In flight" detail="One step running, four complete. The running dot is the only motion.">
        <ToolActivity steps={TOOL_ACTIVITY_STEPS} />
      </SpecimenCase>
      <SpecimenCase label="CHAT-13 · Completed trail" detail="A finished run collapses to a compact trail above the answer.">
        <ToolActivity
          steps={[
            { id: "c1", label: "Searched the web", detail: "8 sources", state: "done" },
            { id: "c2", label: "Ran code", detail: "Completed in 1.4s", state: "done" },
          ]}
        />
      </SpecimenCase>
      <SpecimenCase label="CHAT-13 · A step failed" detail="The failure is local to the step; the answer still renders.">
        <ToolActivity
          steps={[
            { id: "f1", label: "Searched the web", detail: "8 sources", state: "done" },
            { id: "f2", label: "Read sources", detail: "2 of 8 timed out", state: "failed" },
            { id: "f3", label: "Analysed files", detail: "3 files", state: "done" },
          ]}
        />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-14 — the source tray. */
export function SourcesBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="Sources appear beneath the answer and collapse. No right column is permanently reserved for them.">
      <SpecimenCase label="CHAT-14 · Source tray" detail="Collapsible, keyboard reachable, four mocked rows.">
        <div className={styles.measure}>
          <SourceTray sources={SOURCE_TRAY} />
        </div>
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-15 — the artifact failing locally: conversation untouched, one retry. */
export function ArtifactErrorBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="A failed preview stays inside the panel chrome. The thread behind it is unchanged and retry is a single quiet control.">
      <SpecimenCase label="CHAT-15 · Artifact error" detail="Local alert, explicit retry, back-to-chat always present.">
        <ArtifactPanel
          status="error"
          error={{ title: "Artifact did not load", detail: "The preview failed locally. The conversation is unchanged.", action: "Try again" }}
        />
      </SpecimenCase>
      <SpecimenCase label="CHAT-15 · Artifact loading" detail="Inline status, never a full-view spinner.">
        <ArtifactPanel status="loading" />
      </SpecimenCase>
    </ChatSpecimenSurface>
  );
}

/** CHAT-21 — every failure, local to the thing that failed. */
export function ErrorsBoard({ theme = "system" }: { theme?: Theme }) {
  return (
    <ChatSpecimenSurface theme={theme} align="top" note="No failure replaces the application. Each one appears next to the operation that failed, keeps the draft, and offers exactly one recovery.">
      {CHAT_ERRORS.map((error) => (
        <SpecimenCase key={error.kind} label={`CHAT-21 · ${error.kind}`} detail={error.title}>
          <ChatComposer
            notice={{ title: error.title, detail: error.detail, action: error.action, tone: error.tone }}
            initialValue={error.kind === "message-failed" ? "Review the D18A board and tell me what still feels generic." : ""}
          />
        </SpecimenCase>
      ))}
    </ChatSpecimenSurface>
  );
}
