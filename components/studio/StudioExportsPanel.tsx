"use client";

import { useActiveProjectState } from "./studio-project-scope";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StudioPageFrame } from "./StudioPageFrame";
import { StudioStatusPill } from "./StudioStatusPill";
import { StudioSetupState } from "./v5/shell/StudioSetupState";
import { StudioSlotHost } from "./slots/StudioSlotHost";

interface AssetOption {
  id: string;
  filename: string;
  kind: string;
  latestVersion: number;
}

interface PinnedInput {
  assetId: string;
  version: number;
  contentHash: string;
  kind: string;
}

interface ExportRow {
  exportId: string;
  preset: string;
  presetVersion: string;
  title: string;
  lifecycle: string;
  manifestHash: string | null;
}

interface ReviewLinkRow {
  linkId: string;
  reviewId: string;
  reviewTitle: string;
  assetIds: string[];
  note: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Client mirror of the server-advertised V1 presets
 * (`MEDIA_EXPORT_PRESETS` in `@ethen/studio-core/server/media`, server-only).
 * The server re-validates; an unknown preset fails closed there.
 */
const PRESETS = ["source-package", "review-package", "delivery-mp4", "interchange-otio", "interchange-fcpxml"] as const;

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  return `key-${Date.now().toString(36)}`;
}

interface ApiFailure {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string; details?: { dependency?: string } } | string;
}

async function api(path: string, init?: RequestInit): Promise<ApiFailure> {
  const response = await fetch(path, init);
  return (await response.json()) as ApiFailure;
}

function setupDependencyOf(body: ApiFailure | null): string | null {
  if (!body || body.ok || typeof body.error === "string") return null;
  if (body.error?.code !== "SETUP_REQUIRED") return null;
  return body.error.details?.dependency ?? "supabase";
}

function errorMessage(body: { error?: { code?: string; message?: string; details?: { dependency?: string } } | string }, fallback: string): string {
  if (typeof body.error === "string") return body.error;
  const code = body.error?.code;
  const message = body.error?.message ?? fallback;
  return code ? `${code}: ${message}` : message;
}

/**
 * Studio M5 — exports and review console on the V1 runtime.
 * Exports claim pinned asset versions through /v1/media/exports; review
 * links ride /v1/collaboration reviews. Project comes from the fixed prop
 * or the active project (M1 binding) — no per-panel selector.
 */
export function StudioExportsPanel({ fixedProjectId, routeMarker }: { fixedProjectId?: string; routeMarker?: string } = {}) {
  const [activeProjectId] = useActiveProjectState();
  const projectId = fixedProjectId ?? activeProjectId;
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [reviews, setReviews] = useState<ReviewLinkRow[]>([]);
  const [preset, setPreset] = useState<string>("source-package");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [setupDependency, setSetupDependency] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewTtlDays, setReviewTtlDays] = useState("7");
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async (pid: string) => {
    const [listedAssets, listedExports, listedReviews] = await Promise.all([
      api(`/api/studio/v1/assets?projectId=${encodeURIComponent(pid)}`),
      api(`/api/studio/v1/media/exports?projectId=${encodeURIComponent(pid)}`),
      api(`/api/studio/v1/collaboration/reviews?projectId=${encodeURIComponent(pid)}`),
    ]);
    if (listedAssets.ok) {
      setAssets(((listedAssets.data?.items ?? []) as Array<Record<string, unknown>>).map((item) => ({
        id: String(item.assetId ?? item.id ?? ""),
        filename: String(item.filename ?? item.assetId ?? item.id ?? ""),
        kind: String(item.kind ?? ""),
        latestVersion: typeof item.latestVersion === "number" ? item.latestVersion : 0,
      })).filter((item) => item.id.length > 0));
    }
    if (listedExports.ok) {
      setExports(((listedExports.data?.exports ?? []) as Array<Record<string, unknown>>).map((row) => ({
        exportId: String(row.exportId ?? ""),
        preset: String(row.preset ?? ""),
        presetVersion: String(row.presetVersion ?? ""),
        title: String(row.title ?? ""),
        lifecycle: String(row.lifecycle ?? "pending"),
        manifestHash: typeof row.manifestHash === "string" ? row.manifestHash : null,
      })).filter((row) => row.exportId.length > 0));
    }
    if (listedReviews.ok) {
      const found: ReviewLinkRow[] = [];
      for (const review of ((listedReviews.data?.reviews ?? []) as Array<Record<string, unknown>>)) {
        const reviewId = String(review.reviewId ?? "");
        if (!reviewId) continue;
        const links = await api(`/api/studio/v1/collaboration/reviews/${encodeURIComponent(reviewId)}/links?projectId=${encodeURIComponent(pid)}`).catch(() => null);
        if (!links?.ok) continue;
        for (const link of ((links.data?.links ?? []) as Array<Record<string, unknown>>)) {
          const linkId = String(link.linkId ?? "");
          if (!linkId) continue;
          found.push({
            linkId,
            reviewId,
            reviewTitle: String(review.title ?? ""),
            assetIds: Array.isArray(link.assetIds) ? (link.assetIds as unknown[]).filter((id): id is string => typeof id === "string") : [],
            note: String(link.note ?? ""),
            expiresAt: typeof link.expiresAt === "string" ? link.expiresAt : null,
            revokedAt: typeof link.revokedAt === "string" ? link.revokedAt : null,
            createdAt: String(link.createdAt ?? ""),
          });
        }
      }
      setReviews(found.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    }
    const setup = setupDependencyOf(listedExports) ?? setupDependencyOf(listedReviews) ?? setupDependencyOf(listedAssets);
    setSetupDependency(setup);
    const firstFailure = [listedAssets, listedExports, listedReviews].find((result) => !result.ok);
    if (firstFailure && setupDependencyOf(firstFailure) === null) {
      setFeedback(errorMessage(firstFailure, "Console refresh failed."));
    } else if (firstFailure) {
      setFeedback(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: fetch-on-project effect; state settles only after network resolves/rejects, no synchronous cascade.
    if (projectId) void refresh(projectId).catch(() => setFeedback("Console refresh failed."));
  }, [projectId, refresh]);

  const toggleAsset = useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }, []);

  const pinSelected = useCallback(async (pid: string, ids: string[]): Promise<PinnedInput[] | null> => {
    const pins: PinnedInput[] = [];
    for (const id of ids) {
      const detail = await api(`/api/studio/v1/assets/${encodeURIComponent(id)}?projectId=${encodeURIComponent(pid)}`).catch(() => null);
      const versions = (detail?.data as { asset?: { versions?: Array<Record<string, unknown>>; kind?: unknown } } | undefined)?.asset?.versions ?? [];
      const head = versions[0];
      const version = typeof head?.version === "number" ? head.version : 0;
      const contentHash = typeof head?.sha256 === "string" ? head.sha256 : "";
      const kind = String((detail?.data as { asset?: { kind?: unknown } } | undefined)?.asset?.kind ?? "");
      if (!detail?.ok || version <= 0 || !/^[0-9a-f]{64}$/i.test(contentHash) || !kind) {
        setFeedback(`Asset ${id.slice(0, 8)} has no hashed version to pin; ingest it first.`);
        return null;
      }
      pins.push({ assetId: id, version, contentHash, kind });
    }
    return pins;
  }, []);

  const createExport = useCallback(async () => {
    if (!projectId || selected.length === 0 || working) return;
    setWorking(true);
    setFeedback(null);
    try {
      const inputs = await pinSelected(projectId, selected);
      if (!inputs) return;
      const body = await api("/api/studio/v1/media/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, preset, title: title.trim(), idempotencyKey: idempotencyKey(), inputs }),
      }).catch(() => ({ ok: false as const, error: "request failed" }));
      if (!body.ok) {
        setFeedback(errorMessage(body, "Export failed."));
        return;
      }
      setFeedback(`Export ${String((body.data as Record<string, unknown> | undefined)?.lifecycle ?? "recorded")} — id ${String((body.data as Record<string, unknown> | undefined)?.exportId ?? "").slice(0, 12)}…`);
      await refresh(projectId);
    } finally {
      setWorking(false);
    }
  }, [projectId, selected, working, preset, title, pinSelected, refresh]);

  const createReview = useCallback(async () => {
    if (!projectId || selected.length === 0 || working) return;
    setWorking(true);
    setFeedback(null);
    setFreshToken(null);
    try {
      const pins = await pinSelected(projectId, selected);
      if (!pins) return;
      const review = await api("/api/studio/v1/collaboration/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: reviewNote.trim() || title.trim() || `Review ${new Date().toLocaleDateString()}`,
          idempotencyKey: idempotencyKey(),
          pinnedAssets: pins.map((pin) => ({ assetId: pin.assetId, version: pin.version, contentHash: pin.contentHash })),
        }),
      }).catch(() => ({ ok: false as const, error: "request failed" }));
      if (!review.ok) {
        setFeedback(errorMessage(review, "Review creation failed."));
        return;
      }
      const reviewId = String((review.data as { review?: { reviewId?: unknown } } | undefined)?.review?.reviewId ?? "");
      if (!reviewId) {
        setFeedback(errorMessage(review, "Review creation failed."));
        return;
      }
      const ttlMs = Number(reviewTtlDays) > 0 ? Number(reviewTtlDays) * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const link = await api(`/api/studio/v1/collaboration/reviews/${encodeURIComponent(reviewId)}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, idempotencyKey: idempotencyKey(), assetIds: selected, ttlMs, note: reviewNote.trim() }),
      }).catch(() => ({ ok: false as const, error: "request failed" }));
      if (!link.ok) {
        setFeedback(errorMessage(link, "Review link failed."));
        return;
      }
      const token = String((link.data as Record<string, unknown> | undefined)?.token ?? "");
      if (!token) {
        setFeedback(errorMessage(link, "Review link failed."));
        return;
      }
      setFreshToken(token);
      setFeedback("Review link created — the token below displays once. Copy it now.");
      await refresh(projectId);
    } finally {
      setWorking(false);
    }
  }, [projectId, selected, working, title, reviewNote, reviewTtlDays, pinSelected, refresh]);

  const revokeReview = useCallback(async (linkId: string) => {
    if (!projectId || working) return;
    setWorking(true);
    try {
      const body = await api(`/api/studio/v1/collaboration/links/${encodeURIComponent(linkId)}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }).catch(() => ({ ok: false as const, error: "request failed" }));
      if (!body.ok) setFeedback(errorMessage(body, "Revoke failed."));
      await refresh(projectId);
    } finally {
      setWorking(false);
    }
  }, [projectId, working, refresh]);

  return (
    <StudioPageFrame
      eyebrow="EXPORTS"
      routeMarker={routeMarker ?? "/studio/exports"}
      title="Exports & Review"
      description="Advertised V1 exports with verified bytes and pinned provenance; token-gated review links with expiry and revocation."
      actions={
        <Link href="/studio/work/assets" className="inline-flex rounded-[9px] bg-[var(--bg-surface)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
          Open Assets
        </Link>
      }
      statusPills={
        <>
          <StudioStatusPill label="Verified bytes" tone="live" />
          {projectId ? <StudioStatusPill label={`${exports.length} exports · ${reviews.length} links`} tone="neutral" /> : null}
        </>
      }
    >
      {!projectId ? (
        <div className="rounded-[20px] bg-[var(--bg-surface)] px-6 py-14 text-center text-[13px] text-[var(--text-secondary)]">
          Select a project. Exports never run unscoped.{" "}
          <Link className="underline" href="/studio/work/projects">Open projects</Link>
        </div>
      ) : setupDependency !== null ? (
        <div data-testid="exports-setup">
          <StudioSetupState
            what="Exports"
            dependency={setupDependency}
            primaryLabel="Open Assets"
            primaryHref={`/studio/work/assets?projectId=${encodeURIComponent(projectId)}`}
          />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <section className="rounded-[18px] bg-[var(--bg-surface)] px-5 py-5">
              <h2 className="text-[15px] text-[var(--text-primary)]">New export</h2>
              <div className="mt-3 flex gap-2">
                <select value={preset} onChange={(event) => setPreset(event.target.value)} className="rounded-[8px] bg-[var(--bg-inset)] px-3 py-2 text-[12.5px]">
                  {PRESETS.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title (optional)" className="min-w-0 flex-1 rounded-[8px] bg-[var(--bg-inset)] px-3 py-2 text-[12.5px] outline-none" />
              </div>
              <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
                {assets.map((asset) => (
                  <label key={asset.id} className="flex items-center gap-2 rounded-[8px] bg-[var(--bg-inset)] px-3 py-2 text-[12px]">
                    <input type="checkbox" checked={selected.includes(asset.id)} onChange={() => toggleAsset(asset.id)} />
                    <span className="truncate text-[var(--text-primary)]">{asset.filename}</span>
                    <span className="ml-auto shrink-0 text-[var(--text-tertiary)]">{asset.kind} · v{asset.latestVersion}</span>
                  </label>
                ))}
                {assets.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No owned assets in this project yet.</p> : null}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void createExport()} disabled={selected.length === 0 || working} className="rounded-[8px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50">
                  Export ({selected.length})
                </button>
                <button type="button" onClick={() => void createReview()} disabled={selected.length === 0 || working} className="rounded-[8px] bg-[var(--bg-elevated)] px-4 py-2 text-[12.5px]">
                  Share for review
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Review note (optional)" className="min-w-0 flex-1 rounded-[8px] bg-[var(--bg-inset)] px-3 py-2 text-[12px] outline-none" />
                <select value={reviewTtlDays} onChange={(event) => setReviewTtlDays(event.target.value)} className="rounded-[8px] bg-[var(--bg-inset)] px-2 py-2 text-[12px]">
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>
              {freshToken ? (
                <p className="mt-2 break-all rounded-[8px] bg-[var(--bg-inset)] px-3 py-2 font-mono text-[11px] text-[var(--text-primary)]">{freshToken}</p>
              ) : null}
              {freshToken ? (
                <div className="mt-3">
                  <h3 className="text-[12.5px] font-medium text-[var(--text-primary)]">Recipient preview</h3>
                  <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">How the created link resolves right now.</p>
                  <div className="mt-2">
                    <StudioSlotHost
                      slot="ReviewPanel"
                      projectId={projectId}
                      reviewToken={freshToken}
                    />
                  </div>
                </div>
              ) : null}
              {feedback ? <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{feedback}</p> : null}
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[18px] bg-[var(--bg-surface)] px-5 py-5">
              <h2 className="text-[15px] text-[var(--text-primary)]">Exports ({exports.length})</h2>
              <div className="mt-3 space-y-2">
                {exports.map((row) => (
                  <div key={row.exportId} className="rounded-[10px] bg-[var(--bg-inset)] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="mr-auto text-[13px] text-[var(--text-primary)]">{row.preset} <span className="text-[var(--text-tertiary)]">v{row.presetVersion}</span></p>
                      <StudioStatusPill label={row.lifecycle} tone={row.lifecycle === "ready" ? "live" : row.lifecycle === "failed" ? "setup" : "neutral"} />
                    </div>
                    <p className="mt-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">manifest {row.manifestHash ? row.manifestHash.slice(0, 16) + "…" : "pending"}</p>
                  </div>
                ))}
                {exports.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No exports yet. <Link className="underline" href={projectId ? `/studio/create/image?projectId=${encodeURIComponent(projectId)}` : "/studio"}>Create something</Link></p> : null}
              </div>
            </section>

            <section className="rounded-[18px] bg-[var(--bg-surface)] px-5 py-5">
              <h2 className="text-[15px] text-[var(--text-primary)]">Review links ({reviews.length})</h2>
              <div className="mt-3 space-y-2">
                {reviews.map((link) => (
                  <div key={link.linkId} className="rounded-[10px] bg-[var(--bg-inset)] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="mr-auto text-[12.5px] text-[var(--text-primary)]">{link.note || link.reviewTitle || `${link.assetIds.length} assets`}</p>
                      {link.revokedAt ? <StudioStatusPill label="revoked" tone="setup" /> : <StudioStatusPill label="active" tone="live" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">expires {link.expiresAt ? new Date(link.expiresAt).toLocaleString() : "never"}</p>
                    {!link.revokedAt ? (
                      <button type="button" onClick={() => void revokeReview(link.linkId)} className="mt-1 text-[12px] text-[var(--text-secondary)] underline">
                        Revoke
                      </button>
                    ) : null}
                  </div>
                ))}
                {reviews.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No review links yet. <Link className="underline" href={projectId ? `/studio/work/reviews?projectId=${encodeURIComponent(projectId)}` : "/studio/work/reviews"}>Share an asset for review</Link></p> : null}
              </div>
            </section>
          </div>
        </div>
      )}
    </StudioPageFrame>
  );
}
