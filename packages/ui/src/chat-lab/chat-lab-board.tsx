"use client";

/**
 * CHAT_A1 — the Ethen Chat design-lab board at /dev/ethen-chat-lab.
 *
 * A separate lab, deliberately. The D16.2 lab at /dev/ethen-design-lab governs
 * the D14.5 / D18 marketing program and its specimen family feeds the D17 route
 * census; hanging a chat application shell off it would mix two programs and
 * change a census authority for a job that must not touch D18 at all.
 *
 * Every board below is an iframe at a REAL viewport width, so what a reviewer
 * sees at 390px is what a phone sees at 390px.
 */
import * as React from "react";
import { useThemePreference } from "../theme/theme-preference";
import { CHAT_SPECIMENS } from "./chat-specimen-registry";
import { CHAT_VIEWPORTS, ChatViewportFrame, chatViewport } from "./chat-viewport-frame";
import styles from "./chat-lab-board.module.css";

const THEMES = ["system", "light", "dark"] as const;

const BOARD_ORDER: readonly Readonly<{ code: string; specimen: string; viewport: string; note: string }>[] = [
  { code: "CHAT-01", specimen: "empty-dark", viewport: "w1440", note: "The calm the whole product is measured against. Rail, greeting, composer — nothing else." },
  { code: "CHAT-02", specimen: "empty-light", viewport: "w1440", note: "Designed, not inverted: tinted paper rail, the composer is the only white card." },
  { code: "CHAT-03", specimen: "sidebar-full", viewport: "w1440", note: "Four primary items, projects, history, one escape hatch, a compact account row." },
  { code: "CHAT-04", specimen: "sidebar-dense", viewport: "w1440", note: "Twenty-three conversations: grouping, truncation, independent scroll." },
  { code: "CHAT-05", specimen: "composer-empty", viewport: "w1440", note: "Empty, ready and generating — one control, three states." },
  { code: "CHAT-06", specimen: "composer-attachments", viewport: "w1440", note: "Ready, uploading and failed tiles, plus the attachment menu." },
  { code: "CHAT-07", specimen: "composer-tool-active", viewport: "w1440", note: "Active tools as removable tokens, not permanent pills." },
  { code: "CHAT-08", specimen: "model-selector", viewport: "w1440", note: "One model name; intelligence level lives inside the same menu." },
  { code: "CHAT-09", specimen: "tools-menu", viewport: "w1440", note: "Five tools, each naming the Ethen surface it would bind to." },
  { code: "CHAT-10", specimen: "conversation-short", viewport: "w1440", note: "Message rhythm: contained user turn, open Ethen canvas." },
  { code: "CHAT-11", specimen: "conversation-research", viewport: "w1440", note: "Long research: activity trail, headings, table, ordered list, sources." },
  { code: "CHAT-12", specimen: "conversation-code", viewport: "w1440", note: "Code blocks that scroll inside themselves, and an artifact handoff." },
  { code: "CHAT-13", specimen: "tool-activity", viewport: "w1440", note: "Execution state only — running, complete, failed. Never reasoning." },
  { code: "CHAT-14", specimen: "sources", viewport: "w1440", note: "A collapsible tray under the answer; no reserved right column." },
  { code: "CHAT-15", specimen: "artifact-panel", viewport: "w1440", note: "44% of the workspace. The chat keeps its thread and its composer." },
  { code: "CHAT-15", specimen: "artifact-error", viewport: "w1440", note: "Loading and error stay inside the panel; retry is one quiet control." },
  { code: "CHAT-16", specimen: "project-context", viewport: "w1440", note: "A chip in the strip and a line in the composer. Not a project dashboard." },
  { code: "CHAT-17", specimen: "search-palette", viewport: "w1440", note: "Chats, Projects, Artifacts first; platform destinations last and labelled." },
  { code: "CHAT-18", specimen: "empty-dark", viewport: "w390", note: "Mobile empty state at the mandatory review width." },
  { code: "CHAT-18", specimen: "mobile-drawer", viewport: "w390", note: "The rail becomes a drawer with a scrim and a real close control." },
  { code: "CHAT-19", specimen: "conversation-research", viewport: "w390", note: "Full-width conversation, 16px input, actions at touch size." },
  { code: "CHAT-05", specimen: "composer-multiline", viewport: "w1440", note: "A tall draft caps and scrolls internally; the footer never moves." },
  { code: "CHAT-19", specimen: "composer-keyboard", viewport: "w390", note: "Keyboard-height simulation: tall draft plus a failed tile, Send blocked, footer reachable." },
  { code: "CHAT-20", specimen: "artifact-panel", viewport: "w390", note: "The artifact takes the whole view and returns to chat explicitly." },
  { code: "CHAT-21", specimen: "errors", viewport: "w1440", note: "Six failures, each local to the operation that failed." },
  { code: "CHAT-22", specimen: "loading", viewport: "w1440", note: "Rail and composer are real before the conversation is." },
  { code: "CHAT-22", specimen: "streaming", viewport: "w1440", note: "Live steps, partial prose, actions withheld until the turn completes." },
  { code: "CHAT-22", specimen: "streaming-live", viewport: "w1440", note: "Deterministic story: send, watch prose/code/tools stream, Stop mid-flight, Retry, scroll away and jump back." },
  { code: "CHAT-22", specimen: "streaming-live", viewport: "w390", note: "The same live stream at the mandatory review width." },
  { code: "CHAT-10", specimen: "stress-100-turns", viewport: "w1440", note: "One hundred turns: prose, code, activity, sources, stopped, failed, retried." },
];

const RESPONSIVE_SWEEP = ["w2560", "w1440", "w1280", "w1024", "w768", "w390", "w320"] as const;

const DECISIONS: readonly Readonly<{ title: string; body: string }>[] = [
  {
    title: "The rail recedes",
    body: "--chat-sidebar sits one tone BELOW --chat-canvas in dark and is tinted paper in light. The conversation is the only lit surface, which is the inverse of the usual elevated-navigation convention and of the supplied reference.",
  },
  {
    title: "272px, four items",
    body: "New, Search, Projects, Artifacts. No flagship product appears in the Chat rail; Code, Studio, Voice, Flow, Designer, Founder, Sentinel, Gateway, Compute, Model Intelligence and Local Models all belong to platform.upcube.ai, reachable through one restrained escape hatch.",
  },
  {
    title: "Typography alone",
    body: "No Ethen signature glyph is invented here. The repository carries no authoritative Ethen mark, so the greeting is set in the approved sans at 32px / 500 / -0.022em and the wordmark carries the brand. There is deliberately no starburst equivalent.",
  },
  {
    title: "One composer, one model control",
    body: "The empty state and the thread mount the same component. Intelligence level lives inside the model menu instead of becoming a second permanent pill, because Ethen already owns routing, a gateway and a local-models runtime.",
  },
  {
    title: "Accent is a signal",
    body: "Lapis appears on send-ready, selection, focus, links and the artifact mark. Nothing large is washed in it, and no gradient, glass or glow appears anywhere in the shell.",
  },
  {
    title: "Depth without shadow",
    body: "Hairlines, one tonal step per level, and spacing. The only shadows in the product are on floating menus, the palette and a 1px composer lift.",
  },
];

const DIFFERENCES: readonly string[] = [
  "Serif greeting → Ethen sans at display size. The reference’s editorial serif is its identity, not ours.",
  "Elevated navigation rail → a rail that sits below the canvas.",
  "Circular send button → an 8px soft square.",
  "Two footer mode pills → one model control carrying its own intelligence level.",
  "Rounded-cap icon family → EDS instrument marks: 24-unit grid, 1.5px stroke, butt caps, miter joins.",
  "Brand starburst before the greeting → no mark at all until an Ethen mark is authoritative.",
  "Neutral grey surfaces → the warm Ground Lapis / Mineral Paper families already approved in EDS.",
];

export function ChatLabBoard() {
  const [theme, setTheme] = useThemePreference();
  const [viewportOverride, setViewportOverride] = React.useState<string>("board");

  const resolveViewport = (declared: string) =>
    chatViewport(viewportOverride === "board" ? declared : viewportOverride);

  return (
    <main className={styles.root} data-eds data-eds-theme={theme} data-eds-density="work">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.kicker}>/dev/ethen-chat-lab · CHAT_A1</p>
          <h1>Ethen Chat — dedicated chat shell</h1>
          <p className={styles.lede}>
            The first high-fidelity Ethen Chat application shell. A design lab, not a rollout: nothing here is wired to
            a runtime, no production route changed, and chat.upcube.ai is not deployed.
          </p>
        </div>
        <div className={styles.controls}>
          <span className={styles.status}>READY FOR OWNER REVIEW</span>
          <label>
            <span>Appearance</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value as (typeof THEMES)[number])}>
              {THEMES.map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Review width</span>
            <select value={viewportOverride} onChange={(event) => setViewportOverride(event.target.value)}>
              <option value="board">Board default</option>
              {CHAT_VIEWPORTS.map((viewport) => (
                <option key={viewport.id} value={viewport.id}>
                  {viewport.label}px
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className={styles.panel} aria-labelledby="chat-decisions">
        <h2 id="chat-decisions">Design decisions</h2>
        <div className={styles.decisions}>
          {DECISIONS.map((decision) => (
            <article key={decision.title}>
              <h3>{decision.title}</h3>
              <p>{decision.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="chat-differences">
        <h2 id="chat-differences">Learned from the reference · deliberately different</h2>
        <p className={styles.panelLede}>
          Retained as structure: a minimal rail, a large uninterrupted canvas, a centred empty state, a compact
          composer carrying model choice, projects separated from history, a quiet account area, and restraint
          everywhere else. Changed on purpose:
        </p>
        <ul className={styles.differences}>
          {DIFFERENCES.map((difference) => (
            <li key={difference}>{difference}</li>
          ))}
        </ul>
      </section>

      <section className={styles.boards} aria-labelledby="chat-boards">
        <h2 id="chat-boards" className={styles.sectionTitle}>
          CHAT-01 … CHAT-22
        </h2>
        {BOARD_ORDER.map((board) => {
          const specimen = CHAT_SPECIMENS.find((candidate) => candidate.id === board.specimen);
          const viewport = resolveViewport(board.viewport);
          return (
            <article className={styles.board} key={`${board.code}-${board.specimen}-${board.viewport}`}>
              <header className={styles.boardHeader}>
                <span className={styles.boardCode}>{board.code}</span>
                <div>
                  <h3>{specimen?.title ?? board.specimen}</h3>
                  <p>{board.note}</p>
                </div>
              </header>
              <ChatViewportFrame
                specimen={board.specimen}
                width={viewport.width}
                height={viewport.height}
                label={`${board.code} · ${specimen?.title ?? board.specimen}`}
                theme={theme}
              />
            </article>
          );
        })}
      </section>

      <section className={styles.boards} aria-labelledby="chat-responsive">
        <h2 id="chat-responsive" className={styles.sectionTitle}>
          Responsive certification
        </h2>
        <p className={styles.panelLede}>
          The same empty state at every certified width. 768px and below drop the rail into a drawer; 390px is the
          mandatory review state.
        </p>
        <div className={styles.sweep}>
          {RESPONSIVE_SWEEP.map((id) => {
            const viewport = chatViewport(id);
            return (
              <ChatViewportFrame
                key={id}
                specimen="empty-dark"
                width={viewport.width}
                height={viewport.height}
                label={`${viewport.label}px`}
                theme={theme}
              />
            );
          })}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="chat-scope">
        <h2 id="chat-scope">Scope</h2>
        <ul className={styles.scope}>
          <li>
            <strong>Design lab only.</strong> No production Chat route, no DNS, no deploy, no marketing change.
          </li>
          <li>
            <strong>D15–D18 untouched.</strong> This lab adds one isolated /dev route and one component directory; the
            approved homepage, MarketingPageRenderer, the D18A Public Foundation board and the D16.2 lab are unchanged.
          </li>
          <li>
            <strong>Tokens layer, never replace.</strong> Every --chat-* value aliases an EDS token or is one derived
            tonal step, resolved through the same data-eds-theme convention EDS already uses.
          </li>
          <li>
            <strong>Mocks are labelled.</strong> Model names are design-lab placeholders, tools do not execute, and no
            file is uploaded.
          </li>
        </ul>
      </section>
    </main>
  );
}
