/**
 * CHAT_A1 fixtures — real Ethen content, never lorem ipsum.
 *
 * Every project, conversation title, source and artifact below names something
 * that genuinely exists in this repository (the D18A Public Foundation board,
 * the EDS token authority, the D17 route census, the Cortex router). A design
 * lab that reviews itself against invented content reviews nothing: title
 * truncation, prose measure and code overflow only tell the truth when the
 * strings are the lengths the product will actually produce.
 *
 * Nothing here is wired to a runtime. This is a DESIGN LAB: the composer does
 * not call Cortex, the tools do not execute, the model list is a presentation
 * fixture. Availability claims are stated as such at the point of display.
 */

export type ChatProject = Readonly<{ id: string; name: string; chats: number }>;

export const CHAT_PROJECTS: readonly ChatProject[] = [
  { id: "ethen-v5", name: "Ethen V5", chats: 34 },
  { id: "ventari", name: "Ventari", chats: 11 },
  { id: "model-intelligence", name: "Model Intelligence", chats: 8 },
  { id: "cortex-research", name: "Cortex Research", chats: 5 },
];

export type ChatHistoryItem = Readonly<{ id: string; title: string; project?: string }>;
export type ChatHistoryGroup = Readonly<{ label: string; items: readonly ChatHistoryItem[] }>;

/** The short history the empty state and most specimens show. */
export const CHAT_HISTORY: readonly ChatHistoryGroup[] = [
  {
    label: "Today",
    items: [
      { id: "c1", title: "Continue Ethen V5", project: "Ethen V5" },
      { id: "c2", title: "D18A public foundation review", project: "Ethen V5" },
      { id: "c3", title: "Model directory architecture" },
    ],
  },
  {
    label: "Yesterday",
    items: [
      { id: "c4", title: "Cortex router research" },
      { id: "c5", title: "Fix production indexing" },
      { id: "c6", title: "Homepage design review", project: "Ethen V5" },
    ],
  },
  {
    label: "Previous 7 days",
    items: [
      { id: "c7", title: "Gateway provider catalogue reconciliation" },
      { id: "c8", title: "Sentinel evidence rail states" },
      { id: "c9", title: "Pricing page copy pass" },
    ],
  },
];

/** CHAT-04 — a history long enough to prove scrolling, grouping and truncation. */
export const CHAT_HISTORY_DENSE: readonly ChatHistoryGroup[] = [
  {
    label: "Today",
    items: [
      { id: "d1", title: "Continue Ethen V5", project: "Ethen V5" },
      { id: "d2", title: "D18A public foundation review", project: "Ethen V5" },
      { id: "d3", title: "Model directory architecture" },
      { id: "d4", title: "Why does the route census count 1,038 dead links" },
      { id: "d5", title: "Composer placeholder wording across surfaces" },
    ],
  },
  {
    label: "Yesterday",
    items: [
      { id: "d6", title: "Cortex router research" },
      { id: "d7", title: "Fix production indexing" },
      { id: "d8", title: "Homepage design review", project: "Ethen V5" },
      { id: "d9", title: "Ground Lapis dark theme contrast audit" },
      { id: "d10", title: "Ventari onboarding sequence" },
      { id: "d11", title: "Local models runtime capability matrix" },
    ],
  },
  {
    label: "Previous 7 days",
    items: [
      { id: "d12", title: "Gateway provider catalogue reconciliation" },
      { id: "d13", title: "Sentinel evidence rail states" },
      { id: "d14", title: "Pricing page copy pass" },
      { id: "d15", title: "Instrument Sans vs Newsreader in product chrome" },
      { id: "d16", title: "Studio job orchestrator retry semantics" },
      { id: "d17", title: "Approvals queue empty and error states" },
      { id: "d18", title: "Docs information architecture for developer surfaces" },
    ],
  },
  {
    label: "Older",
    items: [
      { id: "d19", title: "Marketing footer statement rewrite" },
      { id: "d20", title: "Voice session transport fallback" },
      { id: "d21", title: "Designer export renderer fidelity" },
      { id: "d22", title: "Model intelligence leaderboard metrics" },
      { id: "d23", title: "Flow bridge route registry cleanup" },
    ],
  },
];

export type ChatModel = Readonly<{
  id: string;
  name: string;
  group: "Ethen" | "External" | "Open models";
  summary: string;
  recent?: boolean;
}>;

/**
 * Model names are DESIGN-LAB PLACEHOLDERS. No Ethen first-party model naming
 * authority exists in this repository (the Cortex provider registry names
 * providers, not an Ethen model family), so these are presentation fixtures
 * and the board says so on the model board.
 */
export const CHAT_MODELS: readonly ChatModel[] = [
  { id: "astra", name: "Ethen Astra", group: "Ethen", summary: "Balanced everyday reasoning", recent: true },
  { id: "astra-deep", name: "Ethen Astra Deep", group: "Ethen", summary: "Longer deliberation, research and planning" },
  { id: "astra-fast", name: "Ethen Astra Fast", group: "Ethen", summary: "Low latency, short turns", recent: true },
  { id: "external-frontier", name: "Frontier (via Gateway)", group: "External", summary: "Routed through Ethen AI Gateway" },
  { id: "open-local", name: "Local model", group: "Open models", summary: "Served by Ethen Local Models runtime" },
];

export const THINKING_LEVELS = ["Fast", "Think", "Deep"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type ChatTool = Readonly<{
  id: string;
  name: string;
  detail: string;
  /** The repository surface this tool would bind to at runtime integration. */
  surface: string;
}>;

export const CHAT_TOOLS: readonly ChatTool[] = [
  { id: "web", name: "Web", detail: "Search and read live pages", surface: "lib/research" },
  { id: "deep-research", name: "Deep Research", detail: "Multi-source research with citations", surface: "lib/cortex-ultra" },
  { id: "code", name: "Code", detail: "Write and run code in a sandbox", surface: "lib/coding" },
  { id: "computer", name: "Computer", detail: "Operate a browser or desktop", surface: "lib/computer-use" },
  { id: "image", name: "Image", detail: "Generate and edit images", surface: "lib/media" },
];

export const ATTACHMENT_ACTIONS: readonly Readonly<{ id: string; label: string; detail: string }>[] = [
  { id: "file", label: "Upload file", detail: "PDF, Markdown, CSV, code" },
  { id: "image", label: "Upload image", detail: "PNG, JPG, WebP" },
  { id: "project", label: "Add project file", detail: "From Ethen V5" },
  { id: "source", label: "Connect source", detail: "Repository, drive or URL" },
];

export type ChatAttachment = Readonly<{
  id: string;
  name: string;
  kind: "image" | "document" | "code";
  meta: string;
  state?: "ready" | "uploading" | "failed";
}>;

export const CHAT_ATTACHMENTS: readonly ChatAttachment[] = [
  { id: "a1", name: "homepage-1440-dark.png", kind: "image", meta: "PNG · 412 KB", state: "ready" },
  { id: "a2", name: "D18A_PUBLIC_FOUNDATION_BOARD.md", kind: "document", meta: "Markdown · 24 KB", state: "ready" },
  { id: "a3", name: "eds-global.css", kind: "code", meta: "CSS · 18 KB", state: "uploading" },
  { id: "a4", name: "route-census.csv", kind: "document", meta: "CSV · 91 KB", state: "failed" },
];

// ── Conversation content ──────────────────────────────────────────────────

export type ProseBlock =
  | Readonly<{ kind: "p"; text: string }>
  | Readonly<{ kind: "h"; text: string }>
  | Readonly<{ kind: "ul"; items: readonly string[] }>
  | Readonly<{ kind: "ol"; items: readonly string[] }>
  | Readonly<{ kind: "quote"; text: string }>
  | Readonly<{ kind: "code"; language: string; code: string }>
  | Readonly<{ kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }>;

export type ChatSource = Readonly<{ id: string; title: string; origin: string; detail: string }>;

export type ToolStep = Readonly<{
  id: string;
  label: string;
  detail: string;
  state: "running" | "done" | "failed";
}>;

export type ChatTurn = Readonly<{
  id: string;
  role: "user" | "ethen";
  text?: string;
  blocks?: readonly ProseBlock[];
  attachments?: readonly ChatAttachment[];
  steps?: readonly ToolStep[];
  sources?: readonly ChatSource[];
  artifact?: string;
  streaming?: boolean;
  /** CHAT_A2_2 — cumulative streamed text; the parsed `blocks` stay stable while this grows. */
  streamText?: string;
  /** CHAT_A2_1 — a stopped run keeps its partial output and stays retryable. */
  stopped?: boolean;
  /** CHAT_A2_1 — retry attempts after the first, so history is never overwritten. */
  attempt?: number;
  error?: Readonly<{ title: string; detail: string; action: string }>;
}>;

/** CHAT-10 — a short exchange. Enough to prove message rhythm, not a wall. */
export const THREAD_SHORT: readonly ChatTurn[] = [
  {
    id: "s1",
    role: "user",
    text: "Review the D18A Public Foundation board and tell me what still feels generic.",
  },
  {
    id: "s2",
    role: "ethen",
    blocks: [
      {
        kind: "p",
        text: "Three areas are drifting. The page-family system is doing less work than its vocabulary claims, and two of the four families are currently distinguished only by their hero.",
      },
      { kind: "h", text: "1. The family vocabulary is not load-bearing" },
      {
        kind: "p",
        text: "`Standard`, `Editorial`, `Decision` and `Document` all resolve to the same section stack below the hero. A reader cannot tell which family a page belongs to without reading the code, which means the vocabulary is a naming convention rather than a design system.",
      },
      { kind: "h", text: "2. Section rhythm is uniform where it should be argued" },
      {
        kind: "ul",
        items: [
          "Every family uses the same 64px section spacing, so a Decision page reads at the same pace as a Document page.",
          "Editorial pages need a narrower measure than 72ch to earn the name.",
          "Document pages carry no persistent in-page navigation, so long legal pages have no orientation.",
        ],
      },
      { kind: "h", text: "3. The accent is doing decoration, not signalling" },
      {
        kind: "p",
        text: "Lapis appears in eight places on a single composed page. Reserve it for the one decision the page is asking for, and let hairlines and spacing carry the rest.",
      },
      {
        kind: "quote",
        text: "The fastest fix is to make Decision the only family that may place accent above the fold.",
      },
    ],
  },
];

/** CHAT-11 — a long research answer with tool steps and sources. */
export const THREAD_RESEARCH: readonly ChatTurn[] = [
  {
    id: "r1",
    role: "user",
    text: "How are the frontier labs positioning dedicated chat surfaces against their platform consoles? I want the split we should be arguing for at chat.upcube.ai.",
  },
  {
    id: "r2",
    role: "ethen",
    steps: [
      { id: "t1", label: "Searched the web", detail: "12 results · 4 kept", state: "done" },
      { id: "t2", label: "Read sources", detail: "4 pages", state: "done" },
      { id: "t3", label: "Analysed files", detail: "3 repository authorities", state: "done" },
    ],
    blocks: [
      {
        kind: "p",
        text: "The pattern is consistent: the conversational surface is kept deliberately poor in navigation, and everything organisational is pushed to a second property. The split is not a layout decision — it is a decision about what the product is for.",
      },
      { kind: "h", text: "What the split usually looks like" },
      {
        kind: "table",
        head: ["Surface", "Owns", "Explicitly excludes"],
        rows: [
          ["Chat", "Conversation, projects, artifacts, files, models", "Billing, teams, infrastructure, developer surfaces"],
          ["Platform", "Workspaces, admin, developer console, usage", "Long-form conversation"],
        ],
      },
      { kind: "h", text: "What this means for Ethen" },
      {
        kind: "ol",
        items: [
          "`chat.upcube.ai` keeps four primary navigation items and nothing else: New, Search, Projects, Artifacts.",
          "The flagship products — Code, Studio, Voice, Flow, Designer, Founder, Sentinel, Gateway, Compute — never appear in the Chat rail. They belong to `platform.upcube.ai`.",
          "One restrained escape hatch, near the bottom of the rail, is enough to carry the relationship in both directions.",
        ],
      },
      {
        kind: "p",
        text: "The risk is the opposite of the one usually feared. A chat surface does not fail by being too sparse; it fails when the rail slowly accumulates a product directory and the conversation stops being the subject of the page.",
      },
      { kind: "h", text: "Where Ethen can differ" },
      {
        kind: "p",
        text: "Every reference implementation surfaces model choice inside the composer and stops there. Ethen already owns a router, a gateway and a local-models runtime, so the composer can present one selected model and let intelligence level, routing and locality live inside that one control instead of spreading across the footer as separate pills.",
      },
    ],
    sources: [
      { id: "s1", title: "Ethen Chat — dedicated chatbot UI design spec", origin: "Repository", detail: "design/ref/chat · 2026-09-08" },
      { id: "s2", title: "D18 route redesign map", origin: "Repository", detail: "artifacts/d18 · 209 routes" },
      { id: "s3", title: "Cortex provider registry", origin: "Repository", detail: "lib/cortex/provider-registry.ts" },
      { id: "s4", title: "Gateway model catalogue", origin: "Repository", detail: "lib/gateway/model-catalog" },
    ],
  },
];

/** CHAT-12 — code, inline code, and an artifact handoff. */
export const THREAD_CODE: readonly ChatTurn[] = [
  {
    id: "k1",
    role: "user",
    text: "The chat rail is reading as a dashboard. Give me the token layer that makes it recede instead.",
  },
  {
    id: "k2",
    role: "ethen",
    blocks: [
      {
        kind: "p",
        text: "The rail reads as a dashboard because it is elevated above the canvas. Invert the step: put the rail one tone BELOW `--eds-canvas` and let the conversation be the only lit surface.",
      },
      {
        kind: "code",
        language: "css",
        code: `[data-ethen-chat] {
  /* the conversation is the stage; the rail is the room */
  --chat-canvas: var(--eds-canvas);   /* #151513 */
  --chat-sidebar: #101010;            /* one step BELOW the canvas */
  --chat-composer: #212019;           /* the only surface that rises */
  --chat-border: var(--eds-rule-hair);
}

.rail {
  background: var(--chat-sidebar);
  border-right: 1px solid var(--chat-border);
  width: var(--chat-rail-width, 272px);
}`,
      },
      {
        kind: "p",
        text: "Two consequences worth accepting deliberately. Hover on rail rows must now step UP toward the canvas rather than down, and the rail border has to stay a hairline — a stronger rule re-introduces the dashboard frame you are trying to remove.",
      },
      {
        kind: "code",
        language: "tsx",
        code: `export function RailRow({ active, children }: RailRowProps) {
  return (
    <button type="button" data-active={active || undefined} className={styles.row}>
      {children}
    </button>
  );
}`,
      },
      {
        kind: "p",
        text: "I put the full token layer, both themes, into an artifact so you can review it against the light board without scrolling this thread.",
      },
    ],
    artifact: "ETHEN_CHAT_DESIGN_NOTES.md",
  },
];

/** CHAT-13 — tool activity mid-flight, one completed, one failed. */
export const TOOL_ACTIVITY_STEPS: readonly ToolStep[] = [
  { id: "a1", label: "Thinking", detail: "", state: "done" },
  { id: "a2", label: "Searched the web", detail: "8 sources", state: "done" },
  { id: "a3", label: "Read sources", detail: "4 of 8", state: "done" },
  { id: "a4", label: "Ran code", detail: "Completed in 1.4s", state: "done" },
  { id: "a5", label: "Analysing files", detail: "3 files", state: "running" },
];

export const SOURCE_TRAY: readonly ChatSource[] = THREAD_RESEARCH[1].sources ?? [];

// ── Artifact ──────────────────────────────────────────────────────────────

export const ARTIFACT_TITLE = "ETHEN_CHAT_DESIGN_NOTES.md";

export const ARTIFACT_BODY = `# Ethen Chat — token layer

## Dark (Ground Lapis)

| Role | Value | Derivation |
| --- | --- | --- |
| canvas | #151513 | --eds-canvas |
| sidebar | #101010 | one step below canvas |
| composer | #212019 | between --eds-paper and --eds-card |
| border | #2B2A25 | --eds-rule-hair |
| accent | #9497DB | --eds-lapis |

## Light (Mineral Paper)

The light theme is designed, not inverted. The rail is tinted paper
(#F2EFE7) and the composer is the only true white card on the page,
so the surfaced element is the same one in both themes.

## Rules

1. Accent is reserved for send-ready, selection, focus and links.
2. No radius above 16px on an ordinary control.
3. Depth comes from tone and spacing, never from shadow.
4. The rail recedes; the conversation is the only lit surface.
`;

// ── Search palette ────────────────────────────────────────────────────────

export type SearchResult = Readonly<{
  id: string;
  title: string;
  group: "Chats" | "Projects" | "Artifacts" | "Ethen Platform";
  detail: string;
  /** CHAT_A5.1 — local chat id opened on activation (Chats group only). */
  chatId?: string;
  /** CHAT_A5.1 — non-chat destinations have no lab surface; visibly unavailable. */
  disabled?: boolean;
}>;

export const SEARCH_RESULTS: readonly SearchResult[] = [
  { id: "q1", title: "D18A public foundation review", group: "Chats", detail: "Today · Ethen V5", chatId: "c2" },
  { id: "q2", title: "Homepage design review", group: "Chats", detail: "Yesterday · Ethen V5", chatId: "c6" },
  { id: "q3", title: "Ground Lapis dark theme contrast audit", group: "Chats", detail: "Yesterday" },
  { id: "q4", title: "Ethen V5", group: "Projects", detail: "34 chats · pinned", disabled: true },
  { id: "q5", title: "Model Intelligence", group: "Projects", detail: "8 chats", disabled: true },
  { id: "q6", title: "ETHEN_CHAT_DESIGN_NOTES.md", group: "Artifacts", detail: "Markdown · today", disabled: true },
  { id: "q7", title: "route-census-1440.csv", group: "Artifacts", detail: "CSV · yesterday", disabled: true },
  { id: "q8", title: "Model Intelligence", group: "Ethen Platform", detail: "platform.upcube.ai", disabled: true },
  { id: "q9", title: "AI Gateway", group: "Ethen Platform", detail: "platform.upcube.ai", disabled: true },
];

// ── Errors ────────────────────────────────────────────────────────────────

export type ChatErrorKind =
  | "message-failed"
  | "model-unavailable"
  | "upload-failed"
  | "tool-failed"
  | "offline"
  | "rate-limit";

export const CHAT_ERRORS: readonly Readonly<{
  kind: ChatErrorKind;
  title: string;
  detail: string;
  action: string;
  tone: "danger" | "attention";
}>[] = [
  {
    kind: "message-failed",
    title: "Message did not send",
    detail: "The connection dropped before Ethen received the turn. Your draft is kept.",
    action: "Retry",
    tone: "danger",
  },
  {
    kind: "model-unavailable",
    title: "Ethen Astra Deep is unavailable",
    detail: "The provider behind this model is not responding. Astra can answer this turn instead.",
    action: "Switch to Astra",
    tone: "attention",
  },
  {
    kind: "upload-failed",
    title: "route-census.csv could not be uploaded",
    detail: "The file is 91 KB and the read failed midway. Nothing was attached.",
    action: "Try again",
    tone: "danger",
  },
  {
    kind: "tool-failed",
    title: "Web search failed",
    detail: "Two of eight sources timed out. Ethen answered from what it could read.",
    action: "Run again",
    tone: "attention",
  },
  {
    kind: "offline",
    title: "You are offline",
    detail: "Ethen will send this turn as soon as the connection returns.",
    action: "Reconnect",
    tone: "attention",
  },
  {
    kind: "rate-limit",
    title: "Rate limit reached",
    detail: "You have used this hour’s Astra Deep budget. It resets in 24 minutes.",
    action: "View usage",
    tone: "attention",
  },
];

/**
 * CHAT_A5 — deterministic 100-turn stress transcript. Pure filler with the
 * full block vocabulary (prose, headings, lists, code, tool activity,
 * sources) plus one stopped attempt, one failed attempt, and one completed
 * retry, so the lab can prove long-transcript stability without invented
 * product history. No randomness: the same call always builds the same turns.
 */
export function buildStressTranscript(count = 100): readonly ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let n = 0; n < count; n += 1) {
    const userId = `stress-u-${n}`;
    const assistantId = `stress-a-${n}`;
    turns.push({ id: userId, role: "user", text: `Stress prompt ${n + 1}: check the composer state.` });
    const kind = n % 8;
    const short: ChatTurn = {
      id: assistantId,
      role: "ethen",
      blocks: [{ kind: "p", text: `Stress answer ${n + 1}: the composer keeps one draft, one run owner, one send gate.` }],
    };
    if (kind === 0) turns.push(short);
    else if (kind === 1)
      turns.push({
        id: assistantId,
        role: "ethen",
        blocks: [
          { kind: "h", text: `Finding ${n + 1}` },
          { kind: "p", text: "The rail recedes one tone below the canvas so the conversation stays the lit surface." },
          { kind: "p", text: "Accent appears on send-ready, selection, focus, and links — nowhere else." },
        ],
      });
    else if (kind === 2)
      turns.push({
        id: assistantId,
        role: "ethen",
        blocks: [{ kind: "ul", items: ["One composer for empty and docked states.", "Intelligence lives inside the model menu.", "Tools multi-select without closing."] }],
      });
    else if (kind === 3)
      turns.push({
        id: assistantId,
        role: "ethen",
        blocks: [{ kind: "code", language: "css", code: `.rail {\n  background: var(--chat-sidebar);\n  width: 272px;\n}` }],
      });
    else if (kind === 4)
      turns.push({
        id: assistantId,
        role: "ethen",
        steps: [
          { id: `${assistantId}-t1`, label: "Searched the web", detail: "8 sources", state: "done" },
          { id: `${assistantId}-t2`, label: "Read sources", detail: "3 pages", state: "done" },
        ],
        blocks: [{ kind: "p", text: `Stress answer ${n + 1}: execution state only, never reasoning.` }],
      });
    else if (kind === 5)
      turns.push({
        id: assistantId,
        role: "ethen",
        blocks: [{ kind: "p", text: `Stress answer ${n + 1}: citations keep stable numbers across chunks.` }],
        sources: [
          { id: `${assistantId}-s1`, title: "Ethen Chat design spec", origin: "Repository", detail: "design/ref/chat" },
          { id: `${assistantId}-s2`, title: "D18 route redesign map", origin: "Repository", detail: "artifacts/d18" },
        ],
      });
    else if (kind === 6)
      turns.push({
        id: assistantId,
        role: "ethen",
        blocks: [
          { kind: "ol", items: ["Follow pins only near the bottom.", "Reading back suspends follow.", "Jump to latest resumes."] },
          { kind: "quote", text: "The reader is never yanked while reading older content." },
        ],
      });
    else
      turns.push({
        id: assistantId,
        role: "ethen",
        blocks: [
          {
            kind: "p",
            text: `Stress answer ${n + 1}: a longer research-style response proving the canvas stays comfortable over many screens. Paragraph rhythm, list rhythm, and heading contrast must hold when the transcript is a hundred turns deep and the reader has scrolled past dozens of exchanges to get here.`,
          },
        ],
      });
  }
  // One stopped attempt keeps its partial output and stays retryable.
  const stopped = turns.findIndex((turn) => turn.id === "stress-a-10");
  if (stopped >= 0)
    turns[stopped] = {
      ...turns[stopped],
      streaming: false,
      stopped: true,
      blocks: [{ kind: "p", text: "Stress answer 11 (partial): stopped mid-stream, content kept." }],
    };
  // One failed attempt keeps its error; the next exchange is its completed retry.
  const failed = turns.findIndex((turn) => turn.id === "stress-a-20");
  if (failed >= 0)
    turns[failed] = {
      ...turns[failed],
      streaming: false,
      error: { title: "Message did not send", detail: "The local run failed. Your content is kept.", action: "Retry" },
      blocks: [{ kind: "p", text: "Stress answer 21 (partial): failed before completion." }],
    };
  const retried = turns.findIndex((turn) => turn.id === "stress-a-21");
  if (retried >= 0)
    turns[retried] = {
      ...turns[retried],
      attempt: 2,
      blocks: [{ kind: "p", text: "Stress answer 22: retry of the failed attempt, history preserved." }],
    };
  return turns;
}

export const GREETING = "Good evening, Sha.";
export const GREETING_ALTERNATES = [
  "What are we building?",
  "Ready when you are.",
  "What should we work on?",
  "Let’s make something.",
] as const;

export const COMPOSER_PLACEHOLDER = "Ask Ethen anything…";
export const ACCOUNT = { name: "Sha", plan: "Ethen Pro", initial: "S" } as const;
