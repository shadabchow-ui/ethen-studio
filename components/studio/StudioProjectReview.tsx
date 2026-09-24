"use client";

/**
 * Studio V3 Job 4 — project review surface (authenticated).
 *
 * Candidate outputs from the durable project graph, compare/select on the
 * shared stage, accept/reject/comment/restore verdicts with full request
 * evidence (prompt, settings, references, receipt, routing, cost,
 * evaluation), and consent-checked review-link issuance. Token viewers
 * stay read-only: decisions and link issuance require project membership.
 */

import { useCallback, useEffect, useState } from "react";
import { StudioStage, type StudioStageItem } from "./StudioStage";
import { useStudioSwitches } from "./use-studio-workspace-hooks";

interface GraphAsset {
  id: string;
  kind: string;
  title: string;
  jobId: string | null;
  contentHash: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

interface Decision {
  id: string;
  assetId: string;
  verdict: "accepted" | "rejected" | "restored";
  comment: string | null;
  createdAt: string;
}

interface JobEvidence {
  status: string;
  prompt: string | null;
  settings: Record<string, unknown>;
  references: string[];
  receipt: { providerId: string; modelId: string; capability: string } | null;
  credits: number | null;
  evaluation: { verdict: string; confidence: string } | null;
}

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(path, init);
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseGraphAssets(body: Record<string, unknown>): GraphAsset[] {
  const data = (body.data ?? body) as Record<string, unknown>;
  const assets = Array.isArray(data.assets) ? data.assets : [];
  return (assets as Array<Record<string, unknown>>).map((row, index) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id : `asset-${index}`,
      kind: typeof row.asset_kind === "string" ? row.asset_kind : typeof metadata.kind === "string" ? (metadata.kind as string) : "image",
      title: typeof metadata.name === "string" ? (metadata.name as string) : typeof row.id === "string" ? (row.id as string).slice(0, 8) : `asset-${index}`,
      jobId: typeof metadata.jobId === "string" ? (metadata.jobId as string) : null,
      contentHash: typeof row.content_hash === "string" ? (row.content_hash as string) : null,
      width: typeof metadata.width === "number" ? (metadata.width as number) : null,
      height: typeof metadata.height === "number" ? (metadata.height as number) : null,
      durationSeconds: typeof metadata.durationSeconds === "number" ? (metadata.durationSeconds as number) : null,
    };
  });
}

export function StudioProjectReview({ projectId }: { projectId: string }) {
  const switches = useStudioSwitches();
  const [assets, setAssets] = useState<GraphAsset[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Record<string, JobEvidence | null>>({});
  const [comment, setComment] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [links, setLinks] = useState<Array<{ id: string; url: string; expiresAt: string }>>([]);

  const reload = useCallback(() => {
    const ticket = switches.issue("asset", projectId);
    void Promise.all([
      api(`/api/media/graph?projectId=${encodeURIComponent(projectId)}`, { signal: ticket.signal }),
      api(`/api/media/reviews/decisions?projectId=${encodeURIComponent(projectId)}`, { signal: ticket.signal }),
      api(`/api/media/reviews?projectId=${encodeURIComponent(projectId)}`, { signal: ticket.signal }),
    ])
      .then(([graph, verdicts, reviewLinks]) => {
        switches.commitIfCurrent("asset", ticket, () => {
          setAssets(parseGraphAssets(graph.body));
          const rows = Array.isArray(verdicts.body.decisions) ? (verdicts.body.decisions as Decision[]) : [];
          setDecisions(Object.fromEntries(rows.map((row) => [row.assetId, row])));
          const linkRows = Array.isArray((reviewLinks.body as Record<string, unknown>).links) ? ((reviewLinks.body as Record<string, unknown>).links as Array<{ id: string; url: string; expiresAt: string }>) : [];
          setLinks(linkRows);
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        switches.commitIfCurrent("asset", ticket, () => setNote("Review data is unavailable."));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadEvidence = useCallback((asset: GraphAsset) => {
    if (!asset.jobId || evidence[asset.id] !== undefined) return;
    const route = asset.kind === "video" ? "video" : "image";
    void api(`/api/media/${route}/jobs/${encodeURIComponent(asset.jobId)}?projectId=${encodeURIComponent(projectId)}`)
      .then(({ status, body }) => {
        if (status >= 400) {
          setEvidence((current) => ({ ...current, [asset.id]: null }));
          return;
        }
        const job = (body.job ?? {}) as { status?: string; quote?: { credits?: number } };
        const request = (body.request ?? {}) as { prompt?: string; settings?: Record<string, unknown>; references?: string[]; receipt?: { providerId: string; modelId: string; capability: string } };
        const evaluation = (body.evaluation ?? null) as { verdict?: string; confidence?: string } | null;
        setEvidence((current) => ({
          ...current,
          [asset.id]: {
            status: typeof job.status === "string" ? job.status : "unknown",
            prompt: typeof request.prompt === "string" ? request.prompt : null,
            settings: (request.settings ?? {}) as Record<string, unknown>,
            references: Array.isArray(request.references) ? request.references : [],
            receipt: request.receipt ?? null,
            credits: typeof job.quote?.credits === "number" ? job.quote.credits : null,
            evaluation: evaluation && typeof evaluation.verdict === "string" ? { verdict: evaluation.verdict, confidence: String(evaluation.confidence ?? "unknown") } : null,
          },
        }));
      })
      .catch(() => setEvidence((current) => ({ ...current, [asset.id]: null })));
  }, [evidence, projectId]);

  const toggleSelect = useCallback((asset: GraphAsset) => {
    loadEvidence(asset);
    setSelectedIds((current) => (current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current.slice(-1), asset.id]));
  }, [loadEvidence]);

  const decide = useCallback((verdict: "accepted" | "rejected" | "restored") => {
    const target = selectedIds[selectedIds.length - 1];
    const asset = assets.find((entry) => entry.id === target);
    if (!target || !asset) return;
    void api("/api/media/reviews/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
      body: JSON.stringify({ projectId, assetId: target, jobId: asset.jobId, verdict, comment: comment.trim() || null }),
    }).then(({ status, body }) => {
      if (status >= 400) {
        setNote(typeof body.error === "string" ? body.error : "Decision failed.");
        return;
      }
      setComment("");
      setNote(`Recorded ${verdict}.`);
      reload();
    });
  }, [selectedIds, assets, comment, projectId, reload]);

  const issueLink = useCallback(() => {
    if (selectedIds.length === 0) return;
    void api("/api/media/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
      body: JSON.stringify({ projectId, assetIds: selectedIds, note: "Project review share" }),
    }).then(({ status, body }) => {
      if (status >= 400) {
        setNote(typeof body.error === "string" ? body.error : "Review link failed.");
        return;
      }
      setNote("Review link issued.");
      reload();
    });
  }, [selectedIds, projectId, reload]);

  const stageItems: StudioStageItem[] = selectedIds
    .map((id) => assets.find((entry) => entry.id === id))
    .filter((entry): entry is GraphAsset => !!entry)
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind === "video" ? "video" : "image",
      title: `${entry.title}${decisions[entry.id] ? ` · ${decisions[entry.id].verdict}` : ""}`,
      previewUrl: `/api/media/assets/${encodeURIComponent(entry.id)}?projectId=${encodeURIComponent(projectId)}`,
      assetId: entry.id,
      jobId: entry.jobId,
    }));

  const focusAsset = assets.find((entry) => entry.id === selectedIds[selectedIds.length - 1]) ?? null;
  const focusEvidence = focusAsset ? evidence[focusAsset.id] : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <StudioStage
          mode={stageItems.length === 0 ? "empty" : stageItems.length > 2 ? "grid" : stageItems.length === 2 ? "compare" : "review"}
          items={stageItems}
          selectedId={selectedIds[selectedIds.length - 1] ?? null}
          actions={{ onSelectVariant: (item) => setSelectedIds([item.id]) }}
          emptyTitle="Select outputs to review"
          emptyHint="Pick one or two project outputs below to compare them on the stage."
        />
        <section aria-label="Outputs" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3">
          {assets.length === 0 ? <p className="text-[12.5px] text-[var(--text-tertiary)]">No project outputs yet.</p> : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {assets.map((asset) => {
                const verdict = decisions[asset.id]?.verdict;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => toggleSelect(asset)}
                      aria-pressed={selectedIds.includes(asset.id)}
                      className={`w-full rounded-[10px] border px-2 py-2 text-left ${selectedIds.includes(asset.id) ? "border-[var(--accent)]" : "border-[var(--border-default)]"}`}
                    >
                      <span className="block truncate text-[12px] font-medium text-[var(--text-primary)]">{asset.title}</span>
                      <span className="block text-[11px] text-[var(--text-tertiary)]">{asset.kind}{verdict ? ` · ${verdict}` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside aria-label="Review decision" className="h-fit space-y-3 rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
        {note ? <p role="status" className="text-[12px] text-[var(--text-secondary)]">{note}</p> : null}
        {!focusAsset ? (
          <p className="text-[12.5px] text-[var(--text-tertiary)]">Select an output to inspect evidence and decide.</p>
        ) : (
          <>
            <div>
              <h3 className="text-[14px] font-medium text-[var(--text-primary)]">{focusAsset.title}</h3>
              <p className="text-[11.5px] text-[var(--text-tertiary)]">
                {focusAsset.kind} · job {focusAsset.jobId ? focusAsset.jobId.slice(0, 8) : "n/a"} · {decisions[focusAsset.id]?.verdict ?? "undecided"}
              </p>
            </div>
            {focusEvidence === undefined ? <p className="text-[12px] text-[var(--text-tertiary)]" role="status">Loading evidence…</p> : null}
            {focusEvidence === null ? <p className="text-[12px] text-[var(--text-tertiary)]">No job evidence for this output.</p> : null}
            {focusEvidence ? (
              <dl className="space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Status</dt><dd className="text-right text-[var(--text-primary)]">{focusEvidence.status}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Cost</dt><dd className="text-right text-[var(--text-primary)]">{focusEvidence.credits === null ? "n/a" : `${focusEvidence.credits} credits`}</dd></div>
                {focusEvidence.receipt ? <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Route</dt><dd className="truncate text-right text-[var(--text-primary)]">{focusEvidence.receipt.providerId}/{focusEvidence.receipt.modelId}</dd></div> : null}
                {focusEvidence.prompt ? <div><dt className="text-[var(--text-tertiary)]">Prompt</dt><dd className="mt-0.5 line-clamp-3 text-[var(--text-primary)]">{focusEvidence.prompt}</dd></div> : null}
                {Object.keys(focusEvidence.settings).length > 0 ? (
                  <div><dt className="text-[var(--text-tertiary)]">Settings</dt>
                    <dd className="mt-0.5 text-[var(--text-primary)]">{Object.entries(focusEvidence.settings).map(([k, v]) => `${k}: ${String(v)}`).join(" · ").slice(0, 220)}</dd>
                  </div>
                ) : null}
                {focusEvidence.references.length > 0 ? <div><dt className="text-[var(--text-tertiary)]">References</dt><dd className="mt-0.5 break-all text-[var(--text-primary)]">{focusEvidence.references.join(", ").slice(0, 220)}</dd></div> : null}
                {focusEvidence.evaluation ? <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Evaluation</dt><dd className="text-right text-[var(--text-primary)]">{focusEvidence.evaluation.verdict} ({focusEvidence.evaluation.confidence})</dd></div> : null}
              </dl>
            ) : null}
            <label className="block text-[12px] text-[var(--text-secondary)]">Comment<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="mt-1 w-full rounded-[8px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)]" /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decide("accepted")} className="rounded-[9px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-white">Accept</button>
              <button type="button" onClick={() => decide("rejected")} className="rounded-[9px] bg-[var(--bg-surface)] px-4 py-2 text-[12.5px] text-[var(--text-primary)]">Reject</button>
              {decisions[focusAsset.id]?.verdict === "rejected" ? <button type="button" onClick={() => decide("restored")} className="rounded-[9px] bg-[var(--bg-surface)] px-4 py-2 text-[12.5px] text-[var(--text-primary)]">Restore</button> : null}
              <button type="button" onClick={issueLink} disabled={selectedIds.length === 0} className="rounded-[9px] bg-[var(--bg-surface)] px-4 py-2 text-[12.5px] text-[var(--text-primary)] disabled:opacity-50">Share link</button>
            </div>
            {links.length > 0 ? (
              <div className="text-[12px] text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">Active review links ({links.length})</p>
                <ul className="mt-1 space-y-1">{links.slice(0, 5).map((link) => <li key={link.id} className="truncate"><a className="underline" href={link.url}>{link.url}</a></li>)}</ul>
              </div>
            ) : null}
          </>
        )}
      </aside>
    </div>
  );
}
