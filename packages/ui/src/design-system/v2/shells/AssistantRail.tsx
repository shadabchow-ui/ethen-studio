"use client";

import { useState, type ReactNode } from "react";
import { V2CompactComposer, type V2ComposerState } from "../composer/Composer";
import { V2Button } from "../Button";
import "./AssistantRail.css";

export type AssistantRailCitation = {
  id: string;
  title: string;
  locator?: string;
};

export type AssistantRailEvidence = {
  id: string;
  label: string;
  detail?: string;
};

export type AssistantRailMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  citations?: AssistantRailCitation[];
  evidence?: AssistantRailEvidence[];
};

export type AssistantRailContext = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

export type AssistantRailAction = {
  id: string;
  label: string;
  onSelect?: () => void;
};

export type AssistantRailState = "idle" | "empty" | "loaded" | "error";

export interface AssistantRailProps {
  context?: AssistantRailContext;
  messages?: AssistantRailMessage[];
  actions?: AssistantRailAction[];
  citations?: AssistantRailCitation[];
  evidence?: AssistantRailEvidence[];
  state?: AssistantRailState;
  errorText?: string;
  onRetry?: () => void;
  composerPlaceholder?: string;
  composerValue?: string;
  onComposerChange?: (value: string) => void;
  onComposerSend?: (value: string) => void;
  composerState?: V2ComposerState;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onActionSelect?: (action: AssistantRailAction) => void;
  onCitationSelect?: (citation: AssistantRailCitation) => void;
  className?: string;
  /** Optional footer note — rendered below composer, flat. */
  footerNote?: string;
}

function Kicker({ children }: { children: ReactNode }) {
  return <span className="assistant-rail__kicker">{children}</span>;
}

export function AssistantRail({
  context,
  messages = [],
  actions = [],
  citations,
  evidence,
  state = "idle",
  errorText,
  onRetry,
  composerPlaceholder = "Ask the assistant…",
  composerValue,
  onComposerChange,
  onComposerSend,
  composerState = "idle",
  collapsed = false,
  onToggleCollapsed,
  onActionSelect,
  onCitationSelect,
  className,
  footerNote,
}: AssistantRailProps) {
  const [internalValue, setInternalValue] = useState("");
  const value = composerValue ?? internalValue;
  const isEmpty = state === "empty" || (messages.length === 0 && state !== "error");
  const isError = state === "error";

  if (collapsed) {
    return (
      <aside className={["assistant-rail assistant-rail--collapsed", className].filter(Boolean).join(" ")} aria-label="Assistant rail collapsed">
        <div className="assistant-rail__collapsed-bar">
          <button type="button" className="assistant-rail__collapse-toggle" aria-label="Expand assistant rail" onClick={onToggleCollapsed}>
            <span aria-hidden>›</span>
          </button>
          <span className="assistant-rail__collapsed-label" aria-hidden>Assistant</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className={["assistant-rail", className].filter(Boolean).join(" ")} aria-label="Assistant rail">
      {/* Header */}
      <div className="assistant-rail__header">
        <div className="assistant-rail__header-main">
          {context?.eyebrow ? <Kicker>{context.eyebrow}</Kicker> : null}
          {context ? (
            <h2 className="assistant-rail__title">{context.title}</h2>
          ) : (
            <h2 className="assistant-rail__title">Assistant</h2>
          )}
          {context?.subtitle ? <p className="assistant-rail__subtitle">{context.subtitle}</p> : null}
          {context?.meta ? <p className="assistant-rail__meta">{context.meta}</p> : null}
        </div>
        {onToggleCollapsed ? (
          <button type="button" className="assistant-rail__collapse-toggle assistant-rail__collapse-toggle--header" aria-label="Collapse assistant rail" onClick={onToggleCollapsed}>
            <span aria-hidden>‹</span>
          </button>
        ) : null}
      </div>

      {/* Body */}
      <div className="assistant-rail__body">
        {isError ? (
          <div className="assistant-rail__state" role="alert" aria-live="polite">
            <p className="assistant-rail__state-title">Assistant context failed to load</p>
            <p className="assistant-rail__state-desc">{errorText ?? "Retry loading context or check the current page context."}</p>
            {onRetry ? <V2Button size="sm" variant="secondary" onClick={onRetry}>Retry</V2Button> : null}
          </div>
        ) : isEmpty ? (
          <div className="assistant-rail__state" aria-label="Empty assistant context">
            <p className="assistant-rail__state-title">No context yet</p>
            <p className="assistant-rail__state-desc">Open a workspace document or run to load contextual assistance. The rail stays empty until context is available — no placeholder cards.</p>
            {actions.length > 0 ? (
              <div className="assistant-rail__actions" aria-label="Contextual actions">
                {actions.map((a) => (
                  <button key={a.id} type="button" className="assistant-rail__action" onClick={() => { a.onSelect?.(); onActionSelect?.(a); }}>{a.label}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {/* Messages — flat rows, no cards */}
            <div className="assistant-rail__messages" aria-label="Assistant messages">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "assistant-rail__snippet assistant-rail__snippet--user" : "assistant-rail__snippet assistant-rail__snippet--assistant"}>
                  <span className="assistant-rail__snippet-role">{m.role === "assistant" ? "Assistant" : "You"}</span>
                  <p className="assistant-rail__snippet-text">{m.text}</p>
                  {m.citations && m.citations.length > 0 ? (
                    <div className="assistant-rail__inline-cites" aria-label="Citations">
                      {m.citations.map((c) => (
                        <button key={c.id} type="button" className="assistant-rail__cite" onClick={() => onCitationSelect?.(c)} aria-label={`Citation ${c.title}`}>
                          <span className="assistant-rail__cite-title">{c.title}</span>
                          {c.locator ? <span className="assistant-rail__cite-locator">{c.locator}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.evidence && m.evidence.length > 0 ? (
                    <div className="assistant-rail__evidence" aria-label="Evidence">
                      {m.evidence.map((e) => (
                        <span key={e.id} className="assistant-rail__evidence-row">
                          <span className="assistant-rail__evidence-label">{e.label}</span>
                          {e.detail ? <span className="assistant-rail__evidence-detail">{e.detail}</span> : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {actions.length > 0 ? (
              <div className="assistant-rail__actions" aria-label="Contextual actions">
                {actions.map((a) => (
                  <button key={a.id} type="button" className="assistant-rail__action" onClick={() => { a.onSelect?.(); onActionSelect?.(a); }}>{a.label}</button>
                ))}
              </div>
            ) : null}

            {(citations && citations.length > 0) || (evidence && evidence.length > 0) ? (
              <div className="assistant-rail__citations" aria-label="Citations and evidence">
                {citations && citations.length > 0 ? (
                  <div className="assistant-rail__cite-group">
                    <Kicker>Citations</Kicker>
                    <div className="assistant-rail__cite-list">
                      {citations.map((c) => (
                        <button key={c.id} type="button" className="assistant-rail__cite assistant-rail__cite--row" onClick={() => onCitationSelect?.(c)}>
                          <span className="assistant-rail__cite-title">{c.title}</span>
                          {c.locator ? <span className="assistant-rail__cite-locator">{c.locator}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {evidence && evidence.length > 0 ? (
                  <div className="assistant-rail__evidence-group">
                    <Kicker>Evidence</Kicker>
                    <div className="assistant-rail__evidence-list">
                      {evidence.map((e) => (
                        <span key={e.id} className="assistant-rail__evidence-row">
                          <span className="assistant-rail__evidence-label">{e.label}</span>
                          {e.detail ? <span className="assistant-rail__evidence-detail">{e.detail}</span> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Composer — compact */}
      <div className="assistant-rail__composer">
        <V2CompactComposer
          value={value}
          onValueChange={(v) => { if (composerValue === undefined) setInternalValue(v); onComposerChange?.(v); }}
          onSend={(v) => { onComposerSend?.(v); if (composerValue === undefined) setInternalValue(""); }}
          placeholder={composerPlaceholder}
          state={composerState}
          contextLabel="Context"
          modeLabel="Ask"
        />
        {footerNote ? <p className="assistant-rail__footer-note">{footerNote}</p> : null}
      </div>
    </aside>
  );
}
