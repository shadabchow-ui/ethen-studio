"use client";

import { useEffect, useState } from "react";
import { StudioPageFrame } from "./StudioPageFrame";
import { StudioStatusPill } from "./StudioStatusPill";

interface ReviewAsset {
  assetId: string;
  title: string;
  kind: string;
  contentHash: string | null;
  signedUrl: string | null;
}

/**
 * Studio V2 Job 08 — token-holder review gallery.
 * No session: the token is the entire authority, bound to one project.
 * Expiry, revocation, removed consent, and removed assets deny with
 * explicit reasons instead of silent empty states.
 */
export function StudioReviewGallery({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");
  const [assets, setAssets] = useState<ReviewAsset[]>([]);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    void fetch(`/api/media/reviews/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (body?.ok && Array.isArray(body?.data?.assets)) {
          setAssets(body.data.assets as ReviewAsset[]);
          setNote(typeof body.data?.note === "string" ? body.data.note : "");
          setState("ready");
        } else {
          setReason(typeof body?.error === "string" ? body.error : "This review link is not available.");
          setState("denied");
        }
      })
      .catch(() => {
        setReason("This review link is not available.");
        setState("denied");
      });
  }, [token]);

  return (
    <StudioPageFrame
      eyebrow="REVIEW"
      title="Shared Review"
      routeMarker="/studio/review/[token]"
      description="Token-gated read-only review. Assets arrive with short-lived links and content hashes; nothing here can mutate, approve, or spend."
      statusPills={
        <>
          <StudioStatusPill label="Read-only" tone="neutral" />
          {state === "ready" ? <StudioStatusPill label={`${assets.length} assets`} tone="live" /> : null}
          {state === "denied" ? <StudioStatusPill label="Unavailable" tone="setup" /> : null}
        </>
      }
    >
      {state === "loading" ? (
        <div className="rounded-[20px] bg-[var(--bg-surface)] px-6 py-14 text-center text-[13px] text-[var(--text-tertiary)]">Resolving review link…</div>
      ) : null}
      {state === "denied" ? (
        <div className="rounded-[20px] bg-[var(--bg-surface)] px-6 py-14 text-center">
          <p className="text-[13.5px] text-[var(--text-secondary)]">{reason}</p>
          <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">Expired, revoked, or withdrawn shares deny explicitly — never silently.</p>
        </div>
      ) : null}
      {state === "ready" ? (
        <div className="space-y-4">
          {note ? <p className="text-[13px] text-[var(--text-secondary)]">{note}</p> : null}
          {assets.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">This share currently contains no viewable assets.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <article key={asset.assetId} className="rounded-[18px] bg-[var(--bg-surface)] px-5 py-4">
                  <p className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{asset.kind}</p>
                  <h3 className="mt-1 truncate text-[14px] text-[var(--text-primary)]">{asset.title}</h3>
                  {asset.contentHash ? <p className="mt-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">sha256:{asset.contentHash.slice(0, 16)}…</p> : null}
                  {asset.signedUrl ? (
                    <a href={asset.signedUrl} className="mt-2 inline-block text-[12px] text-[var(--text-primary)] underline">
                      Open
                    </a>
                  ) : (
                    <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">Preview unavailable.</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </StudioPageFrame>
  );
}
