/**
 * STUDIO_09 — canonical simple-create frame, in the restored original
 * generator grammar (center stage + bottom composer + right Run settings
 * inspector; see GeneratorLayout).
 *
 * One primary Generate/Transcribe action in the composer, separate
 * model/voice slots, schema-driven essential vs Advanced controls in the
 * inspector, and durable history under the stage. Voice/transcribe render
 * their typed extension slots as clearly unavailable until STUDIO_11 binds
 * them; drafts are kept but never persisted as completed generations.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { useCatalogProjection } from "../discovery/useCatalogProjection";
import { providerHealthLabel, providerHealthTone, useProviderHealth } from "../health/provider-health";
import { useCreditBalance } from "../health/use-credit-balance";
import type { CreateJobResultView, CreateReferenceBinding, CreateToolDefinition, ReferenceIntent } from "./types";
import { toolTaskName, toolUnavailableReason } from "./tool-definitions";
import { StudioModelSwitcher } from "./StudioModelSwitcher";
import { CreateSchemaControls } from "./CreateSchemaControls";
import { EstimateBar } from "./EstimateBar";
import { CreateHistoryList, CreateResultCard } from "./CreateResult";
import { useCreateJob } from "./useCreateJob";
import { useCreateHistory } from "./useCreateHistory";
import { useEndpointSpec } from "./useEndpointSpec";
import { draftKeyFor, localStorageHistory } from "./history-model";
import { referencesToParameters, validateReferenceSet } from "./reference-model";
import { formatIcuDollars } from "./create-api-client";
import { QUALITY_PROFILES, applyQualityProfile, type QualityProfileId } from "./quality-profile";
import { GeneratorEmptyStage, GeneratorLayout, GeneratorModeTabs, InspectorSection, modalityFor } from "./GeneratorLayout";
import { ProWorkbenchLink } from "./ProWorkbenchLink";
import { ComposerInputField, GeneratorComposer, GeneratorSettingsButton } from "./GeneratorComposer";
import { adaptCreateSubmit } from "./composer-legacy-adapter";
import { LEGACY_CREATE_INPUT, composerToolFor } from "./composer-registry";

const PHASE_LABELS: Record<string, string> = {
  routing: "Routing to a qualified model…",
  estimating: "Estimating cost…",
  admitting: "Reserving and admitting…",
  running: "Running…",
};

const focus = STUDIO_FOCUS_RING_CLASS;
const fieldClass = "w-full rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-[11px] py-[9px] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]";

function IconButton({ label, onClick, pressed, disabled, children }: { label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:min-h-[32px] pointer-fine:min-w-[32px] ${pressed ? "border-[var(--border-strong)] text-[var(--text-primary)]" : ""} ${focus}`}
    >
      {children}
    </button>
  );
}

function NewReferenceRow({
  kinds,
  onAdd,
}: {
  kinds: readonly string[];
  onAdd: (binding: CreateReferenceBinding) => void;
}) {
  const [assetId, setAssetId] = React.useState("");
  const [kind, setKind] = React.useState(kinds[0] ?? "IMAGE");
  const [intent, setIntent] = React.useState<ReferenceIntent>("preserve");
  const [target, setTarget] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  if (kinds.length === 0) return null;
  return (
    <div className="space-y-2 rounded-[10px] border border-[var(--border-subtle)] p-2.5">
      <p className="text-[12px] font-medium text-[var(--text-primary)]">Add reference</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[11.5px] text-[var(--text-secondary)]">
          Project asset id
          <input aria-label="Reference asset id" value={assetId} onChange={(event) => setAssetId(event.target.value)} placeholder="asset_…" className={fieldClass} />
        </label>
        <label className="space-y-1 text-[11.5px] text-[var(--text-secondary)]">
          Kind
          <select aria-label="Reference kind" value={kind} onChange={(event) => setKind(event.target.value)} className={fieldClass}>
            {kinds.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[11.5px] text-[var(--text-secondary)]">
          Intent
          <select aria-label="Reference intent" value={intent} onChange={(event) => setIntent(event.target.value as ReferenceIntent)} className={fieldClass}>
            <option value="preserve">Preserve</option>
            <option value="change">Change</option>
          </select>
        </label>
        <label className="space-y-1 text-[11.5px] text-[var(--text-secondary)]">
          Target
          <input aria-label="Reference target" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="subject" className={fieldClass} />
        </label>
      </div>
      {intent === "change" ? (
        <label className="block space-y-1 text-[11.5px] text-[var(--text-secondary)]">
          Change instruction
          <input aria-label="Change instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the change…" className={fieldClass} />
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => {
          onAdd({ referenceAssetId: assetId.trim(), referenceKind: kind, intent, target: target.trim(), instruction: instruction.trim() || null });
          setAssetId("");
          setTarget("");
          setInstruction("");
        }}
        disabled={!assetId.trim() || !target.trim()}
        className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3.5 text-[12px] font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[36px] ${focus}`}
      >
        Add reference
      </button>
    </div>
  );
}

export function CreateToolFrame({ tool, projectId, initialPrompt = null }: { tool: CreateToolDefinition; projectId: string | null; initialPrompt?: string | null }) {
  const unavailableReason = toolUnavailableReason(tool);
  const task = toolTaskName(tool);
  const modality = modalityFor(tool.id);
  // Drafts persist under a draft-only key; they never enter history. The
  // initial draft derives at mount (the route adapter keys by scope, so a
  // scope change remounts); null on the server, storage value in browser.
  const [input, setInput] = React.useState(() =>
    initialPrompt ?? (projectId ? (localStorageHistory()?.getItem(draftKeyFor(projectId, tool.id)) ?? "") : ""),
  );
  const [uploadAssetId, setUploadAssetId] = React.useState("");
  const [modelSelection, setModelSelection] = React.useState("auto");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<QualityProfileId>("balanced");
  const [schemaValues, setSchemaValues] = React.useState<Readonly<Record<string, unknown>>>({});
  const [schemaValid, setSchemaValid] = React.useState(true);
  const [schemaProblems, setSchemaProblems] = React.useState<readonly string[]>([]);
  const handleSchemaValidityChange = React.useCallback((valid: boolean, problems: readonly string[]) => {
    setSchemaValid(valid);
    setSchemaProblems(problems);
  }, []);
  const [references, setReferences] = React.useState<readonly CreateReferenceBinding[]>([]);
  const [referencesOpen, setReferencesOpen] = React.useState(false);
  const [voiceIdentityId, setVoiceIdentityId] = React.useState("");
  const [capDollars, setCapDollars] = React.useState("");
  const modelButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const { projection } = useCatalogProjection(projectId);
  const { health: providerHealth, loading: providerHealthLoading } = useProviderHealth();
  const creditBalance = useCreditBalance(projectId);
  const entry = composerToolFor(tool.id);
  const inputCopy =
    tool.inputVariant === "script"
      ? LEGACY_CREATE_INPUT.script
      : tool.inputVariant === "upload"
        ? LEGACY_CREATE_INPUT.upload
        : entry.input;

  React.useEffect(() => {
    if (!projectId) return;
    const storage = localStorageHistory();
    if (!storage) return;
    const handle = window.setTimeout(() => {
      if (input) storage.setItem(draftKeyFor(projectId, tool.id), input);
      else storage.removeItem(draftKeyFor(projectId, tool.id));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [input, projectId, tool.id]);

  const capIcu = React.useMemo(() => {
    if (!capDollars.trim()) return null;
    const dollars = Number(capDollars);
    if (!Number.isFinite(dollars) || dollars < 0) return null;
    return Math.trunc(dollars * 1000);
  }, [capDollars]);

  // The resolved endpoint drives both the schema controls and the profile.
  const [routedEndpointId, setRoutedEndpointId] = React.useState<string | null>(null);
  const resolvedEndpointId = modelSelection === "auto" ? routedEndpointId : modelSelection;
  const endpointSpec = useEndpointSpec(projectId, resolvedEndpointId);
  const profileApplication = React.useMemo(() => applyQualityProfile(endpointSpec.spec, profile), [endpointSpec.spec, profile]);

  const parameters = React.useMemo((): Readonly<Record<string, unknown>> => {
    // Profile first, explicit inspector values win.
    const base: Record<string, unknown> = { ...profileApplication.params, ...schemaValues };
    if (tool.inputVariant === "script") base.script = input;
    else base.prompt = input;
    if (tool.secondaryVariants.includes("upload") && uploadAssetId.trim()) {
      base.sourceAssetId = uploadAssetId.trim();
    }
    if (tool.inputVariant === "upload" && uploadAssetId.trim()) {
      base.sourceAssetId = uploadAssetId.trim();
    }
    if (references.length > 0) base.references = referencesToParameters(references);
    if (tool.id === "voice" && voiceIdentityId.trim()) {
      base.voiceIdentityId = voiceIdentityId.trim();
    }
    return base;
  }, [profileApplication.params, schemaValues, input, uploadAssetId, references, voiceIdentityId, tool]);

  const generation = useCreateJob({ projectId, tool, modelSelection, parameters, capIcu });
  const history = useCreateHistory(projectId, tool.id);
  const decisionEndpointId = generation.decision?.endpointId ?? null;
  // Adopt the Auto-routed endpoint only once the run settles, so profile
  // parameters never change a request between estimate and admission
  // (derived during render, not in an effect).
  if (decisionEndpointId && !generation.busy && decisionEndpointId !== routedEndpointId) {
    setRoutedEndpointId(decisionEndpointId);
  }

  const currentResult: CreateJobResultView | null = generation.job
    ? {
        jobId: generation.job.jobId,
        toolId: tool.id,
        status: generation.job.status,
        statusLabel: generation.job.statusLabel,
        endpointId: generation.job.endpointId || null,
        quoteId: generation.job.quoteId || null,
        promptText: input || "(no input)",
        previewUrl: null,
        costLabel: generation.quote ? `Est. ${formatIcuDollars(generation.quote.estimatedIcu)}` : null,
        retryable: generation.job.retryable || generation.job.status === "FAILED",
        createdAt: generation.job.createdAt,
        updatedAt: generation.job.updatedAt,
      }
    : null;

  // Record admitted jobs into durable history exactly once per job.
  const recordedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!projectId || !generation.job || recordedRef.current === generation.job.jobId) return;
    recordedRef.current = generation.job.jobId;
    history.record({
      projectId,
      idempotencyKey: generation.job.idempotencyKey,
      paramsHash: "",
      jobId: generation.job.jobId,
      toolId: tool.id,
      status: generation.job.status,
      statusLabel: generation.job.statusLabel,
      endpointId: generation.job.endpointId || null,
      quoteId: generation.job.quoteId || null,
      promptText: input || "(no input)",
      previewUrl: null,
      costLabel: generation.quote ? `Est. ${formatIcuDollars(generation.quote.estimatedIcu)}` : null,
      retryable: generation.job.retryable || generation.job.status === "FAILED",
      createdAt: generation.job.createdAt,
      updatedAt: generation.job.updatedAt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation.job?.jobId, generation.job?.status]);

  const tabs = (
    <GeneratorModeTabs
      activeId={tool.id}
      modality={modality}
      projectId={projectId}
      status={
        <span data-testid="create-model-chip" data-route-live={decisionEndpointId ? "true" : "false"} className="inline-flex h-[30px] max-w-[360px] items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[12px] text-[var(--text-secondary)]">
          <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${decisionEndpointId ? "bg-[var(--studio-accent)] shadow-[0_0_7px_var(--studio-accent)]" : "border border-[var(--text-tertiary)]"}`} />
          <span className="truncate">{modelSelection === "auto" ? "Model: Ethen Auto" : `Model: ${modelSelection}`}</span>
          {generation.decision ? <span className="truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">· routed to {generation.decision.endpointId}</span> : null}
        </span>
      }
    />
  );

  if (!projectId) {
    // VISUAL-02 — safe read-only preview: the creative frame stays
    // visible but locked, with one action to resolve the state.
    return (
      <GeneratorLayout
        testId="create-generator-locked"
        title={tool.title}
        routeMarker={tool.route}
        tabs={tabs}
        stage={
          <GeneratorEmptyStage title={tool.title} lead={tool.description} modality={modality}>
            <StudioEmptyState
              title="Select a project to start creating"
              description="Creations belong to a project. Pick one to unlock the model picker, estimates, and history."
              actionLabel="Open projects"
              actionHref="/studio/projects"
              testId="create-no-project"
              compact
            />
          </GeneratorEmptyStage>
        }
        composer={() => (
          <GeneratorComposer
            entry={entry}
            label={`${tool.title} preview (locked)`}
            locked
            input={
              <ComposerInputField
                copy={inputCopy}
                variant={tool.inputVariant === "upload" ? "upload" : tool.inputVariant === "script" ? "script" : "prompt"}
                value=""
                onChange={() => {}}
                disabled
                rows={2}
                textareaClassName="resize-none"
              />
            }
            lockedMeta={
              <span className="inline-flex min-h-[44px] items-center rounded-[9px] border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-tertiary)] pointer-fine:min-h-[32px]">Model: Ethen Auto</span>
            }
          />
        )}
        inspector={
          <InspectorSection title="Run settings">
            <p className="text-[12px] text-[var(--text-secondary)]">Run settings unlock with a project scope.</p>
          </InspectorSection>
        }
      />
    );
  }

  const referenceCheck = validateReferenceSet(references, new Set(references.map((ref) => ref.referenceAssetId)));
  const inputValid =
    tool.inputVariant === "upload" ? uploadAssetId.trim().length > 0 : input.trim().length > 0;
  const canGenerate =
    !unavailableReason &&
    task !== null &&
    inputValid &&
    schemaValid &&
    referenceCheck.ok &&
    !generation.busy &&
    (modelSelection === "auto" || endpointSpec.spec !== null || endpointSpec.loading);

  const submitModel = adaptCreateSubmit(
    entry,
    {
      canGenerate,
      busy: generation.busy,
      phaseLabel: PHASE_LABELS[generation.phase] ?? "Working…",
      reapprovalRequired: generation.reapprovalRequired,
    },
    generation.generate,
  );

  const taskEndpoints = task ? (projection?.endpoints ?? []).filter((endpoint) => endpoint.task === task) : [];
  const qualified = taskEndpoints.filter((endpoint) => endpoint.executable);
  const providers = [...new Set(qualified.map((endpoint) => endpoint.providerId))];
  const selectedEndpoint = resolvedEndpointId ? taskEndpoints.find((endpoint) => endpoint.endpointId === resolvedEndpointId) ?? null : null;
  const modelLabel = modelSelection === "auto" ? "Ethen Auto" : (selectedEndpoint ? `${selectedEndpoint.familyLabel} — ${selectedEndpoint.label}` : modelSelection);

  const stage = currentResult ? (
    <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
      <section aria-label="Result" data-testid="create-stage-result" className="w-full max-w-[720px] space-y-2">
        <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Result</h2>
        <CreateResultCard
          result={currentResult}
          onRetry={generation.error?.retryable || currentResult.retryable ? generation.retry : undefined}
          retryBusy={generation.busy}
        />
      </section>
    </div>
  ) : generation.busy ? (
    <GeneratorEmptyStage
      title={tool.title}
      lead="Your run is in flight. The result stages here as soon as it lands."
      modality={modality}
      generating={PHASE_LABELS[generation.phase] ?? "Generating"}
    >
      <div role="status" data-testid="create-working" className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--studio-accent)] motion-safe:animate-pulse" />
        <p className="text-[12.5px] text-[var(--text-primary)]">{PHASE_LABELS[generation.phase] ?? "Working…"}</p>
      </div>
    </GeneratorEmptyStage>
  ) : (
    <GeneratorEmptyStage
      title={tool.title}
      lead={modality === "visual" ? "Generate images and video from one focused workspace. Results stage here as soon as a job is admitted." : tool.description}
      modality={modality}
      promptFieldId={`create-input-${tool.id}`}
    >
      {unavailableReason ? (
        <div role="status" data-testid="create-slot-unavailable" className="rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-left shadow-[0_14px_40px_rgb(0_0_0/0.35)]">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Not available yet</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">{unavailableReason}</p>
        </div>
      ) : null}
    </GeneratorEmptyStage>
  );

  const historyPanel = (
    <section aria-label="History" className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold text-[var(--text-secondary)]">History</h2>
        <button type="button" onClick={history.refresh} className={`inline-flex min-h-[44px] items-center rounded-[8px] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] pointer-fine:min-h-[28px] ${focus}`}>
          Refresh
        </button>
      </div>
      <CreateHistoryList entries={history.entries} onRetry={generation.retry} />
    </section>
  );

  const composer = (openSettings: (() => void) | null) => (
    <GeneratorComposer
      entry={entry}
      label={`${tool.title} composer`}
      input={
        <>
          {tool.inputVariant === "upload" ? (
            <ComposerInputField
              copy={inputCopy}
              variant="upload"
              value={uploadAssetId}
              onChange={setUploadAssetId}
            />
          ) : (
            <ComposerInputField
              copy={inputCopy}
              variant={tool.inputVariant === "script" ? "script" : "prompt"}
              id={`create-input-${tool.id}`}
              value={input}
              onChange={setInput}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canGenerate) {
                  event.preventDefault();
                  generation.generate();
                }
              }}
              textareaClassName="max-h-[40dvh] min-h-[24px] resize-none [field-sizing:content]"
            />
          )}
          {tool.secondaryVariants.includes("upload") && referencesOpen ? (
            <label className="mb-3 block space-y-1 px-1.5 text-[11.5px] text-[var(--text-secondary)]">
              Source image asset id (optional, for image-to-video and edits)
              <input aria-label="Source image asset id" value={uploadAssetId} onChange={(event) => setUploadAssetId(event.target.value)} placeholder="asset_…" className={fieldClass} />
            </label>
          ) : null}
        </>
      }
      controls={
        <>
          {tool.referenceKinds.length > 0 || tool.secondaryVariants.includes("upload") ? (
          <IconButton label={referencesOpen ? "Hide references" : "Add reference or source"} pressed={referencesOpen} onClick={() => {
            setReferencesOpen((open) => !open);
            if (openSettings && !referencesOpen) openSettings();
          }}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 18.3a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8" /></svg>
          </IconButton>
        ) : null}
        <ProWorkbenchLink toolId={tool.id} projectId={projectId} />
        <span aria-hidden="true" data-testid="create-composer-divider" className="mx-0.5 hidden h-5 w-px bg-[var(--border-default)] sm:block" />
        <div role="radiogroup" aria-label="Quality profile" className="flex shrink-0 items-center gap-[5px]">
          {QUALITY_PROFILES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={profile === option.id}
              onClick={() => setProfile(option.id)}
              disabled={unavailableReason !== null}
              className={`inline-flex min-h-[44px] items-center rounded-[8px] border px-[11px] text-[12px] transition-colors disabled:opacity-50 pointer-fine:min-h-[28px] ${profile === option.id ? "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"} ${focus}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          ref={modelButtonRef}
          type="button"
          aria-label="Model"
          aria-describedby={`model-current-${tool.id}`}
          onClick={() => setPickerOpen(true)}
          disabled={unavailableReason !== null || task === null}
          className={`inline-flex min-h-[44px] max-w-[220px] shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 text-[11.5px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:min-h-[28px] ${focus}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${decisionEndpointId ? "bg-[var(--studio-accent)]" : "bg-[var(--text-secondary)]"}`} />
          <span id={`model-current-${tool.id}`} className="truncate">{modelLabel}</span>
          <span aria-hidden="true">▾</span>
        </button>
        </>
      }
      trailing={openSettings ? <GeneratorSettingsButton onOpen={openSettings} /> : null}
      estimate={
        <EstimateBar
          quote={generation.quote}
          stale={generation.quoteStale}
          reapprovalRequired={generation.reapprovalRequired}
          estimating={generation.phase === "estimating"}
          error={generation.error && generation.phase !== "running" ? generation.error : null}
          onRetry={generation.retry}
          balanceIcu={creditBalance.state === "ready" ? creditBalance.balanceIcu : null}
        />
      }
      submit={submitModel}
      error={
        generation.error && generation.phase === "failed" ? (
          <StudioErrorState
            title={entry.errorTitle}
            description={generation.error.message}
            retryLabel={generation.error.retryable ? "Retry" : undefined}
            onRetry={generation.error.retryable ? generation.retry : undefined}
            testId="create-error"
          />
        ) : null
      }
    />
  );

  const inspector = (
    <>
      <InspectorSection title="Model">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={unavailableReason !== null || task === null}
          aria-label="Change model"
          className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[11px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-3 py-[11px] text-left transition-colors hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-[var(--text-primary)]">{modelLabel}</span>
            <span className="mt-0.5 block truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">
              {resolvedEndpointId ?? (task ? `${task} · deterministic routing` : "no task binding")}
            </span>
          </span>
          <span aria-hidden="true" className="text-[var(--text-tertiary)]">▾</span>
        </button>
        {generation.decision ? <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">{generation.decision.selectedReason}</p> : null}
        {tool.id === "voice" ? (
          <div className="mt-3 space-y-1">
            <label htmlFor={`voice-slot-${tool.id}`} className="text-[12px] text-[var(--text-secondary)]">
              Voice (identity reference)
            </label>
            <input id={`voice-slot-${tool.id}`} value={voiceIdentityId} onChange={(event) => setVoiceIdentityId(event.target.value)} placeholder="voice_…" disabled={unavailableReason !== null} className={`${fieldClass} min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50`} />
            <p className="text-[11.5px] text-[var(--text-tertiary)]">
              Voice and model stay separate. Browse voices in the{" "}
              <Link href="/studio/voices" className={`underline ${focus}`}>voice library</Link>.
            </p>
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Settings">
        <p className="mb-2 text-[11.5px] text-[var(--text-tertiary)]">
          {QUALITY_PROFILES.find((option) => option.id === profile)?.label} profile · {profileApplication.summary}
        </p>
        {endpointSpec.spec ? null : (
          <p className="text-[12px] text-[var(--text-secondary)]">
            {endpointSpec.loading ? "Loading this endpoint's settings…" : "Aspect ratio, resolution and other settings come from the selected model's schema. Pick a model, or generate once with Auto to load them."}
          </p>
        )}
        <CreateSchemaControls spec={endpointSpec.spec} values={schemaValues} onChange={setSchemaValues} onValidityChange={handleSchemaValidityChange} />
        {endpointSpec.error ? (
          <p role="alert" className="mt-2 text-[12px] text-[var(--text-secondary)]">
            {endpointSpec.error.message}{" "}
            <button type="button" onClick={endpointSpec.retry} className={`underline ${focus}`}>
              Retry
            </button>
          </p>
        ) : null}
        {!schemaValid ? (
          <ul className="mt-2 space-y-1" aria-label="Parameter problems">
            {schemaProblems.map((problem) => (
              <li key={problem} className="text-[12px] text-[var(--text-secondary)]">{problem}</li>
            ))}
          </ul>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Provider / route status">
        <div data-testid="create-provider-status" className="overflow-hidden rounded-[11px] border border-[var(--border-default)]">
          <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-3 py-[11px]">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${qualified.length > 0 ? "bg-[var(--studio-accent)] shadow-[0_0_7px_var(--studio-accent)]" : "border-[1.5px] border-[var(--text-tertiary)]"}`} />
            <span className="flex-1 text-[12.5px] text-[var(--text-primary)]">{task ?? "Unbound slot"}</span>
            <span className="text-[11px] text-[var(--text-secondary)]">{projection ? `${qualified.length} of ${taskEndpoints.length} qualified` : "Catalog loading"}</span>
          </div>
          {providers.length > 0 ? (
            providers.slice(0, 4).map((provider) => {
              // M4: per-provider dot + label read the measured health
              // endpoint (data only; tones reuse the header dot classes).
              const view = providerHealth?.[provider] ?? null;
              const tone = providerHealthTone(view);
              const dot =
                tone === "live"
                  ? "bg-[var(--studio-accent)] shadow-[0_0_7px_var(--studio-accent)]"
                  : tone === "down"
                    ? "border-[1.5px] border-[var(--text-tertiary)]"
                    : "bg-[var(--text-secondary)]";
              return (
                <div key={provider} className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-3 py-[11px] last:border-b-0">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <span className="flex-1 truncate text-[12.5px] text-[var(--text-primary)]">{provider}</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Qualified route · {providerHealthLabel(view, providerHealthLoading)}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-2 text-[12px] text-[var(--text-tertiary)]">{projection ? "No qualified provider route for this task yet." : "Provider qualification appears once the catalog loads."}</p>
          )}
          {selectedEndpoint && !selectedEndpoint.executable ? (
            <p className="border-t border-[var(--border-subtle)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]">
              Selected endpoint is not qualified: {selectedEndpoint.disabledReasons[0] ?? "unavailable"}.
            </p>
          ) : null}
        </div>
      </InspectorSection>

      {tool.referenceKinds.length > 0 ? (
        <details open={referencesOpen} onToggle={(event) => setReferencesOpen((event.target as HTMLDetailsElement).open)} className="group mb-[14px] border-t border-[var(--border-subtle)] pt-1">
          <summary className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-[6px] text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden ${focus}`}>
            References
            <span className="inline-flex items-center gap-1.5 text-[11px] font-normal normal-case tracking-normal text-[var(--text-tertiary)]">{references.length > 0 ? `${references.length} attached` : "None"}<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-tertiary)] transition-transform duration-150 group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg></span>
          </summary>
          <div className="mt-2 space-y-2">
            {tool.secondaryVariants.includes("upload") ? (
              <label className="block space-y-1 text-[11.5px] text-[var(--text-secondary)]">
                Source image asset id (optional)
                <input aria-label="Source image asset id (inspector)" value={uploadAssetId} onChange={(event) => setUploadAssetId(event.target.value)} placeholder="asset_…" className={fieldClass} />
              </label>
            ) : null}
            {references.length > 0 ? (
              <ul className="space-y-1" aria-label="References">
                {references.map((ref) => (
                  <li key={`${ref.referenceAssetId}-${ref.target}`} className="flex items-center justify-between gap-2 rounded-[9px] bg-[var(--bg-base)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)]">
                    <span className="min-w-0 truncate">{ref.intent === "preserve" ? "Preserve" : "Change"} {ref.target} from {ref.referenceAssetId}</span>
                    <button type="button" onClick={() => setReferences(references.filter((entry) => entry !== ref))} aria-label={`Remove reference ${ref.referenceAssetId}`} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] hover:text-[var(--text-primary)] sm:min-h-[28px] sm:min-w-[28px] ${focus}`}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <NewReferenceRow kinds={tool.referenceKinds} onAdd={(binding) => setReferences([...references, binding])} />
            {!referenceCheck.ok ? (
              <ul aria-label="Reference problems">
                {referenceCheck.problems.map((problem) => (
                  <li key={problem} className="text-[12px] text-[var(--text-secondary)]">{problem}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

      <details className="group mb-2 border-t border-[var(--border-subtle)] pt-1">
        <summary className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-[6px] text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden ${focus}`}>
          Advanced
          <span className="inline-flex items-center gap-1.5 text-[11px] font-normal normal-case tracking-normal text-[var(--text-tertiary)]">Spend cap<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-tertiary)] transition-transform duration-150 group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg></span>
        </summary>
        <label className="mt-2 block space-y-1 text-[12px] text-[var(--text-secondary)]">
          Spend cap (USD, optional)
          <input aria-label="Spend cap in USD" value={capDollars} onChange={(event) => setCapDollars(event.target.value)} placeholder="No cap" inputMode="decimal" className={`${fieldClass} min-h-[44px]`} />
        </label>
      </details>
    </>
  );

  return (
    <>
      <GeneratorLayout title={tool.title} routeMarker={tool.route} tabs={tabs} stage={stage} history={historyPanel} composer={composer} inspector={inspector} />
      {task ? (
        <StudioModelSwitcher
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          projectId={projectId}
          task={task}
          selectedId={modelSelection}
          onSelect={setModelSelection}
          returnFocusRef={modelButtonRef}
        />
      ) : null}
    </>
  );
}
