import type { AccessStatePresentation } from "./access-state";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Standalone EDS access document for edge denials. Preserves the caller HTTP status. */
export function renderAccessStateDocument(state: AccessStatePresentation): string {
  const title = escapeHtml(state.title);
  const description = escapeHtml(state.description);
  const code = escapeHtml(state.code);
  const kind = escapeHtml(state.kind);
  const httpLabel = escapeHtml(state.httpLabel);
  const product = state.productLabel ? escapeHtml(state.productLabel) : null;
  const primaryHref = escapeHtml(state.primaryAction.href);
  const primaryLabel = escapeHtml(state.primaryAction.label);
  const secondary = state.secondaryAction
    ? `<a class="btn secondary" href="${escapeHtml(state.secondaryAction.href)}">${escapeHtml(state.secondaryAction.label)}</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Ethen</title>
  <style>
    :root {
      --eds-canvas: #151513;
      --eds-card: #262521;
      --eds-elevated: #2E2D28;
      --eds-ink: #F3F1EC;
      --eds-text-secondary: #C6C3BA;
      --eds-rule: #3D3B34;
      --eds-rule-hair: #2B2A25;
      --eds-radius-raised: 12px;
      --eds-radius-base: 6px;
      --eds-elev-overlay-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      --eds-lapis-strong: #ABAEE3;
      --eds-font-sans: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--eds-canvas);
      color: var(--eds-ink);
      font-family: var(--eds-font-sans);
    }
    .panel {
      width: min(440px, 100%);
      padding: 24px;
      border: 1px solid var(--eds-rule);
      border-radius: var(--eds-radius-raised);
      background: var(--eds-elevated);
      box-shadow: var(--eds-elev-overlay-shadow);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 0 8px;
      border: 1px solid var(--eds-rule-hair);
      border-radius: 999px;
      color: var(--eds-text-secondary);
      font-size: 12px;
      line-height: 16px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      line-height: 28px;
    }
    p {
      margin: 8px 0 0;
      color: var(--eds-text-secondary);
      font-size: 13px;
      line-height: 18px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0 16px;
      border-radius: var(--eds-radius-base);
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
    }
    .btn.primary {
      background: var(--eds-ink);
      color: var(--eds-canvas);
    }
    .btn.secondary {
      border: 1px solid var(--eds-rule);
      background: transparent;
      color: var(--eds-ink);
    }
    .btn:focus-visible {
      outline: 2px solid var(--eds-lapis-strong);
      outline-offset: 2px;
    }
  </style>
</head>
<body data-ethen-v2 data-access-state="${kind}" data-access-code="${code}">
  <main class="panel" role="status" aria-labelledby="access-title" data-v2-pattern="access-state">
    <div class="meta">
      <span class="chip">${httpLabel}</span>
      ${product ? `<span class="chip">${product}</span>` : ""}
      <span class="chip">${code}</span>
    </div>
    <h1 id="access-title">${title}</h1>
    <p>${description}</p>
    <div class="actions">
      <a class="btn primary" href="${primaryHref}">${primaryLabel}</a>
      ${secondary}
    </div>
  </main>
</body>
</html>`;
}
