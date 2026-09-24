/**
 * STUDIO_15 — composite workspace: guided brief → references → variants →
 * review. Reuses shell PageHeader/LibraryFrame and the identity selectors;
 * shows identity consistency and cost per variant. Export-first review:
 * approval enables rights-cleared export, never auto-posting, and no fake
 * scheduled/published controls are rendered.
 */
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioEmptyState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import {
  COMPOSITE_STEPS,
  COMPOSITE_STEP_LABELS,
  formatIcu,
  type CampaignBriefView,
  type CampaignView,
  type CompositeKindView,
  type CompositeStep,
  type CompositeUiState,
  type ReviewView,
  type TemplateView,
  type VariantView,
} from "./types";
import { CompositesApiError } from "./composites-api-client";

export interface CompositeWorkspaceProps {
  kind: CompositeKindView;
  uiState: CompositeUiState;
  templates: TemplateView[];
  campaigns: CampaignView[];
  selected: CampaignView | null;
  variants: VariantView[];
  reviews: ReviewView[];
  busy: string | null;
  notice: string | null;
  onSelectCampaign: (campaignId: string) => void;
  onCreateCampaign: (input: {
    title: string;
    templateId: string;
    templateVersion: number;
    appId: string;
    brief: CampaignBriefView;
  }) => void;
  onFanout: (input: { aspectIds: string[]; identities: { identityId: string; version: number | null }[]; costPerVariantIcu: number }) => void;
  onRequestReview: () => void;
  onDecideReview: (reviewId: string, decision: "approved" | "denied", feedback: string | null) => void;
  onRetry: () => void;
}

const INPUT_CLASS = `min-h-[44px] w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] ${STUDIO_FOCUS_RING_CLASS}`;

const ACTION_PRIMARY = `inline-flex min-h-[44px] items-center rounded-[12px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`;
const ACTION_SECONDARY = `inline-flex min-h-[44px] items-center rounded-[12px] bg-[var(--bg-elevated)] px-4 py-2 text-[12.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`;

function identityConsistency(variants: VariantView[]): { consistent: boolean; detail: string } {
  if (variants.length === 0) return { consistent: true, detail: "No variants yet." };
  const first = variants[0].identities.map((i) => `${i.identityId}@v${i.version}`).sort().join(",");
  const mismatched = variants.filter(
    (v) => v.identities.map((i) => `${i.identityId}@v${i.version}`).sort().join(",") !== first,
  );
  if (mismatched.length === 0) {
    return { consistent: true, detail: `${variants[0].identities.length} pinned identities match across ${variants.length} variants.` };
  }
  return { consistent: false, detail: `${mismatched.length} of ${variants.length} variants pin different identities.` };
}

export function CompositeWorkspace(props: CompositeWorkspaceProps) {
  const { kind, uiState } = props;
  const [step, setStep] = useState<CompositeStep>("brief");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [appId, setAppId] = useState("");
  const [brief, setBrief] = useState<CampaignBriefView>({
    audience: "",
    hook: "",
    cta: "",
    caption: "",
    soundtrackAssetId: null,
    capIcu: 5000,
  });
  const [identityIds, setIdentityIds] = useState("");
  const [aspectIds, setAspectIds] = useState("");
  const [costPerVariant, setCostPerVariant] = useState("500");
  const [feedback, setFeedback] = useState("");

  const setBriefField = useCallback((field: keyof CampaignBriefView, value: string | number | null) => {
    setBrief((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (uiState.state === "loading") {
    return (
      <main data-testid="composites-workspace" aria-busy="true" aria-label={kind === "marketing" ? "Marketing Studio" : "AI Influencer"}>
        <StudioPageHeader eyebrow={kind === "marketing" ? "Marketing" : "Influencer"} title={kind === "marketing" ? "Marketing Studio" : "AI Influencer"} description={kind === "marketing" ? "Brief-led product campaigns across formats." : "Character-led story episodes across formats."} routeMarker={kind === "marketing" ? "studio-marketing" : "studio-influencer"} />
        <p role="status" className="mt-6 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)] motion-safe:animate-pulse">Loading compositions…</p>
      </main>
    );
  }

  if (uiState.state === "setup" || uiState.state === "error") {
    const setup = uiState.state === "setup";
    const setupDependency = uiState.state === "setup" ? (uiState.dependency ?? null) : null;
    if (setupDependency !== null) {
      return (
        <main data-testid="composites-workspace" aria-label={kind === "marketing" ? "Marketing Studio" : "AI Influencer"}>
          <StudioPageHeader eyebrow={kind === "marketing" ? "Marketing" : "Influencer"} title={kind === "marketing" ? "Marketing Studio" : "AI Influencer"} description={kind === "marketing" ? "Brief-led product campaigns across formats." : "Character-led story episodes across formats."} routeMarker={kind === "marketing" ? "studio-marketing" : "studio-influencer"} />
          <div className="mt-6" data-testid="composites-setup">
            <StudioSetupState
              what="Campaigns"
              dependency={setupDependency}
              primaryLabel="Go to Assets"
              primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
            />
          </div>
        </main>
      );
    }
    return (
      <main data-testid="composites-workspace" aria-label={kind === "marketing" ? "Marketing Studio" : "AI Influencer"}>
        <StudioPageHeader eyebrow={kind === "marketing" ? "Marketing" : "Influencer"} title={kind === "marketing" ? "Marketing Studio" : "AI Influencer"} description={kind === "marketing" ? "Brief-led product campaigns across formats." : "Character-led story episodes across formats."} routeMarker={kind === "marketing" ? "studio-marketing" : "studio-influencer"} />
        {setup ? (
          <section aria-label="Campaign preview (locked)" className="mt-4 space-y-2 rounded-[16px] border border-[var(--border-subtle)] p-4 opacity-80">
            <p className="text-[12.5px] font-medium text-[var(--text-primary)]">Campaign brief preview</p>
            <div className="space-y-1 text-[11px] text-[var(--text-tertiary)]">
              Audience
              <input disabled aria-label="Audience preview" placeholder="Who is this for?" className="w-full rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-60" />
            </div>
          </section>
        ) : null}
        <div role={setup ? "status" : "alert"} className="mt-6 rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">{setup ? "Setup required" : "Couldn’t load compositions"}</p>
          <p data-testid={setup ? "composites-setup" : "composites-error"} className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-5 text-[var(--text-secondary)]">{uiState.message}</p>
          {uiState.state === "error" ? (
            <button type="button" onClick={props.onRetry} className={`${ACTION_SECONDARY} mt-4`}>
              Retry
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  const template = props.templates.find((t) => t.templateId === templateId) ?? props.templates[0] ?? null;
  const consistency = identityConsistency(props.variants);
  const totalCost = props.variants.reduce((sum, v) => sum + v.estimatedCostIcu, 0);
  const latestReview = props.reviews[0] ?? null;

  return (
    <main data-testid="composites-workspace" aria-label={kind === "marketing" ? "Marketing Studio" : "AI Influencer"}>
      <StudioPageHeader
        eyebrow={kind === "marketing" ? "Marketing" : "Influencer"}
        title={kind === "marketing" ? "Marketing Studio" : "AI Influencer"}
        description={kind === "marketing" ? "Brief-led product campaigns across formats." : "Character-led story episodes across formats."}
        routeMarker={kind === "marketing" ? "studio-marketing" : "studio-influencer"}
      />
      {props.notice ? (
        <p data-testid="composites-notice" role="status" className="mt-3 rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2 text-[12px]">
          {props.notice}
        </p>
      ) : null}

      <div className="grid gap-4 py-4 lg:grid-cols-[280px_1fr]">
        <section aria-label={kind === "marketing" ? "Campaigns" : "Series"} className="space-y-2">
          <h2 className="text-[13px] font-medium">{kind === "marketing" ? "Campaigns" : "Series"} ({props.campaigns.length})</h2>
          {props.campaigns.length === 0 ? (
            <StudioEmptyState
              title="No campaigns yet"
              description={uiState.state === "empty" ? uiState.message : "Create one from a template."}
              testId="composites-empty"
              actionLabel="New campaign"
              onAction={() => {
                setStep("brief");
                if (typeof document !== "undefined") {
                  document.querySelector<HTMLInputElement>('input[aria-label="Campaign title"]')?.focus();
                }
              }}
            />
          ) : (
            <ul className="space-y-2">
              {props.campaigns.map((c) => (
                <li key={c.campaignId}>
                  <button
                    type="button"
                    aria-pressed={c.campaignId === props.selected?.campaignId}
                    onClick={() => props.onSelectCampaign(c.campaignId)}
                    className={`min-h-[44px] w-full rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2 text-left text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-[11px] text-[var(--text-tertiary)]">
                      {c.status} · cap {formatIcu(c.brief.capIcu)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <ol aria-label="Composition steps" className="flex flex-wrap gap-2">
            {COMPOSITE_STEPS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  aria-current={step === s ? "step" : undefined}
                  onClick={() => setStep(s)}
                  className={step === s ? ACTION_PRIMARY : ACTION_SECONDARY}
                >
                  {COMPOSITE_STEP_LABELS[s]}
                </button>
              </li>
            ))}
          </ol>

          {step === "brief" ? (
            <section aria-label="Brief" className="space-y-3 rounded-[16px] border border-[var(--border-subtle)] px-4 py-4">
              <h2 className="text-[13px] font-medium">Brief</h2>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Title
                <input aria-label="Campaign title" className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fall launch" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Template
                <select aria-label="Template" className={INPUT_CLASS} value={template?.templateId ?? ""} onChange={(e) => setTemplateId(e.target.value)}>
                  {props.templates.map((t) => (
                    <option key={`${t.templateId}:v${t.version}`} value={t.templateId}>
                      {t.title} (v{t.version})
                    </option>
                  ))}
                </select>
              </label>
              {template ? (
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {template.description} Aspects: {template.aspects.join(", ")}. Requires: {template.requiredIdentities.join(", ") || "none"}.
                </p>
              ) : null}
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                WorkflowApp id (frozen project app)
                <input aria-label="WorkflowApp id" className={INPUT_CLASS} value={appId} onChange={(e) => setAppId(e.target.value)} placeholder=" existing app uuid" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Audience
                <input aria-label="Audience" className={INPUT_CLASS} value={brief.audience} onChange={(e) => setBriefField("audience", e.target.value)} placeholder="Who is this for?" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Hook
                <textarea aria-label="Hook" className={`${INPUT_CLASS} resize-none`} rows={2} value={brief.hook} onChange={(e) => setBriefField("hook", e.target.value)} placeholder="What lands in the first frame?" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Caption
                <textarea aria-label="Caption" className={`${INPUT_CLASS} resize-none`} rows={2} value={brief.caption} onChange={(e) => setBriefField("caption", e.target.value)} placeholder="Caption copy" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                CTA
                <input aria-label="CTA" className={INPUT_CLASS} value={brief.cta} onChange={(e) => setBriefField("cta", e.target.value)} placeholder="What should the audience do next?" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Budget cap (ICU)
                <input aria-label="Budget cap" className={INPUT_CLASS} inputMode="numeric" value={String(brief.capIcu)} onChange={(e) => setBriefField("capIcu", Number(e.target.value) || 0)} />
              </label>
              <button
                type="button"
                disabled={!template || props.busy !== null}
                onClick={() =>
                  template &&
                  props.onCreateCampaign({ title, templateId: template.templateId, templateVersion: template.version, appId, brief })
                }
                className={ACTION_SECONDARY}
              >
                {props.busy === "create" ? "Creating…" : "Create campaign"}
              </button>
            </section>
          ) : null}

          {step === "references" ? (
            <section aria-label="References" className="space-y-3 rounded-[16px] border border-[var(--border-subtle)] px-4 py-4">
              <h2 className="text-[13px] font-medium">References</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Pin approved identity versions. Every variant pins the same versions; revoked or unconsented identities block fanout.
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Browse approved identities in the <Link className={`underline ${STUDIO_FOCUS_RING_CLASS}`} href="/studio/voices">Voices</Link> and{" "}
                <Link className={`underline ${STUDIO_FOCUS_RING_CLASS}`} href="/studio/identities/characters">identity libraries</Link>, then paste their ids below.
              </p>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Identity ids (comma-separated)
                <input aria-label="Identity ids" className={INPUT_CLASS} value={identityIds} onChange={(e) => setIdentityIds(e.target.value)} placeholder="identity-id-1, identity-id-2" />
              </label>
              <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                Soundtrack asset id (optional; rights checked at use)
                <input
                  aria-label="Soundtrack asset id"
                  className={INPUT_CLASS}
                  value={brief.soundtrackAssetId ?? ""}
                  onChange={(e) => setBriefField("soundtrackAssetId", e.target.value || null)}
                  placeholder="asset id or blank for silent"
                />
              </label>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Soundtrack without commercial and export grants stays private-preview only; download, share, publish and export are denied.
              </p>
            </section>
          ) : null}

          {step === "variants" ? (
            <section aria-label="Variants" className="space-y-3 rounded-[16px] border border-[var(--border-subtle)] px-4 py-4">
              <h2 className="text-[13px] font-medium">Variants</h2>
              {!props.selected ? (
                <p className="text-[12px] text-[var(--text-tertiary)]">Select a campaign to fan out aspect variants.</p>
              ) : (
                <>
                  <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                    Aspects (comma-separated, e.g. 1:1, 9:16)
                    <input aria-label="Aspects" className={INPUT_CLASS} value={aspectIds} onChange={(e) => setAspectIds(e.target.value)} placeholder="9:16, 1:1" />
                  </label>
                  <label className="block space-y-1 text-[11px] text-[var(--text-tertiary)]">
                    Measured estimate per variant (ICU, from the bound app estimate)
                    <input aria-label="Estimate per variant" className={INPUT_CLASS} inputMode="numeric" value={costPerVariant} onChange={(e) => setCostPerVariant(e.target.value)} />
                  </label>
                  <button
                    type="button"
                    disabled={props.busy !== null}
                    onClick={() =>
                      props.onFanout({
                        aspectIds: aspectIds.split(",").map((a) => a.trim()).filter(Boolean),
                        identities: identityIds.split(",").map((id) => id.trim()).filter(Boolean).map((identityId) => ({ identityId, version: null })),
                        costPerVariantIcu: Number(costPerVariant) || 0,
                      })
                    }
                    className={ACTION_SECONDARY}
                  >
                    {props.busy === "fanout" ? "Fanning out…" : "Fan out variants"}
                  </button>
                  <p role="status" className="text-[11px] text-[var(--text-tertiary)]">
                    Identity consistency: {consistency.detail} Total admitted: {formatIcu(totalCost)} of {formatIcu(props.selected.brief.capIcu)} cap.
                  </p>
                  <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
                    {props.variants.map((v) => (
                      <li key={v.variantId} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-3 text-[12px]">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-[var(--text-primary)]">{v.aspectId}</span>
                          <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{v.status}</span>
                        </span>
                        <span className="mt-1 block text-[11.5px] text-[var(--text-secondary)]">
                          {formatIcu(v.estimatedCostIcu)} · r{v.variantRevision} · identities {v.identities.map((i) => `${i.kind}@v${i.version}`).join(", ") || "none"}
                        </span>
                        {v.refusalReason ? <span className="mt-1 block text-[11px] text-[var(--text-secondary)]">Refused: {v.refusalReason}</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}

          {step === "review" ? (
            <section aria-label="Review" className="space-y-3 rounded-[16px] border border-[var(--border-subtle)] px-4 py-4">
              <h2 className="text-[13px] font-medium">Review</h2>
              {!props.selected ? (
                <p className="text-[12px] text-[var(--text-tertiary)]">Select a campaign to request review.</p>
              ) : (
                <>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    Approval pins exact variant versions. Any variant edit or brief change invalidates it and needs a new review.
                    Approval enables rights-cleared export; posting stays gated by an approved publisher integration.
                  </p>
                  <button type="button" disabled={props.busy !== null || props.variants.length === 0} onClick={props.onRequestReview} className={ACTION_SECONDARY}>
                    {props.busy === "review" ? "Requesting…" : "Request review"}
                  </button>
                  {latestReview ? (
                    <div className="space-y-2 rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2 text-[12px]">
                      <p>
                        Latest review: {latestReview.status}
                        {latestReview.decidedBy ? ` by ${latestReview.decidedBy}` : ""} · brief r{latestReview.briefRevision} ·{" "}
                        {Object.keys(latestReview.pinnedVariants).length} pinned variants
                      </p>
                      {latestReview.feedback ? <p className="text-[11px]">Feedback: {latestReview.feedback}</p> : null}
                      {latestReview.status === "requested" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input aria-label="Review feedback" className={INPUT_CLASS} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback (required to deny)" />
                          <button type="button" disabled={props.busy !== null} onClick={() => props.onDecideReview(latestReview.reviewId, "approved", feedback || null)} className={ACTION_PRIMARY}>
                            Approve
                          </button>
                          <button type="button" disabled={props.busy !== null} onClick={() => props.onDecideReview(latestReview.reviewId, "denied", feedback || null)} className={ACTION_SECONDARY}>
                            Deny
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--text-tertiary)]">No reviews yet.</p>
                  )}
                </>
              )}
            </section>
          ) : null}

          {props.busy === "failed" ? <p role="alert" className="text-[12px]">Action failed.</p> : null}
        </div>
      </div>
    </main>
  );
}

export function compositesFailureMessage(failure: unknown): string {
  return failure instanceof CompositesApiError ? failure.message : "Request failed.";
}
