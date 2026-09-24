"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MediaJob } from "@/lib/media/types";
import { ACTIVE_MEDIA_JOB_STATUSES } from "@/lib/media/types";
import { StudioAssetLibrary } from "./StudioAssetLibrary";
import { StudioPageFrame } from "./StudioPageFrame";
import { StudioStatusPill, type StudioStatusTone } from "./StudioStatusPill";
import {
  getMockProjects,
  GRAPH_KIND_LABELS,
  PROJECT_QUICK_ACTION_LABELS,
  PROJECT_QUICK_ACTION_DISABLED,
  type MockProject,
  type MockProjectGraphStep,
  type MockProjectQuickAction,
} from "./studio-mock-projects";



export function StudioAssetsPage({ routeMarker }: { routeMarker?: string }) {
  return <StudioAssetLibrary routeMarker={routeMarker} />;
}

function ProjectCard({
  project,
  isSelected,
  onSelect,
}: {
  project: MockProject;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const statusTone: StudioStatusTone =
    project.status === "active" ? "live" : project.status === "archived" ? "neutral" : "mock";

  return (
    <button
      type="button"
      onClick={() => onSelect(project.id)}
      className={`w-full rounded-[18px] border border-transparent text-left transition duration-150 focus:outline-none ${
        isSelected
          ? "bg-[var(--bg-elevated)] ring-1 ring-[var(--border-default)]"
          : "bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] hover:ring-1 hover:ring-[var(--border-subtle)]"
      }`}
    >
      <div className={`h-[80px] rounded-t-[18px] ${project.coverTone}`}>
        <div className="flex h-full items-center justify-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            {project.displayType}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14.5px] leading-snug text-[var(--text-primary)]">{project.name}</h3>
          <StudioStatusPill
            label={project.status === "active" ? "Active" : project.status === "archived" ? "Archived" : "Draft"}
            tone={statusTone}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
          <span className="uppercase tracking-[0.1em]">{project.displayType}</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          <span>{project.assetCount} assets</span>
        </div>

        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{project.activityLabel}</p>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {project.quickActions.slice(0, 3).map((action) => (
            <span
              key={action}
              className="inline-flex items-center rounded-[6px] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[10.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              {PROJECT_QUICK_ACTION_LABELS[action]}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function GraphStep({ step, isLast }: { step: MockProjectGraphStep; isLast: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-[var(--bg-surface)] text-[10px] font-semibold text-[var(--text-secondary)]">
          {GRAPH_KIND_LABELS[step.kind].charAt(0)}
        </div>
        {!isLast ? <div className="mt-0.5 h-[22px] w-px bg-[var(--border-subtle)]" /> : null}
      </div>
      <div className="pb-3">
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">{step.label}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-secondary)]">{step.detail}</p>
      </div>
    </div>
  );
}

function ProjectDetail({ project, onClose }: { project: MockProject; onClose: () => void }) {
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleAction = useCallback((action: MockProjectQuickAction) => {
    if (PROJECT_QUICK_ACTION_DISABLED.has(action)) {
      setActionFeedback(`${PROJECT_QUICK_ACTION_LABELS[action]} is not wired — mock surface only`);
      return;
    }
    setActionFeedback(`${PROJECT_QUICK_ACTION_LABELS[action]} triggered — mock action (no persistence)`);
  }, []);

  return (
    <div className="rounded-[24px] bg-[var(--bg-surface)] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M7.5 2 3.5 6l4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          All Projects
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StudioStatusPill
            label={project.status === "active" ? "Active" : project.status === "archived" ? "Archived" : "Draft"}
            tone={project.status === "active" ? "live" : project.status === "archived" ? "neutral" : "mock"}
          />
          <StudioStatusPill label="Mock Project" tone="mock" />
        </div>
      </div>

      <div className="mt-5">
        <h2 className="text-[28px] leading-tight tracking-[-0.025em] text-[var(--text-primary)] sm:text-[32px]">
          {project.name}
        </h2>
        <p className="mt-2 max-w-[640px] text-[13.5px] leading-6 text-[var(--text-secondary)]">
          {project.description ?? "No description."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--text-secondary)]">
          <span className="uppercase tracking-[0.12em]">{project.displayType}</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          <span>{project.assetCount} assets</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          <span>{project.activityLabel}</span>
        </div>
      </div>

      <div
        className={`mt-6 h-[96px] rounded-[14px] ${project.coverTone} flex items-center justify-center`}
      >
        <span className="text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          Mock Project Preview
        </span>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Project Lineage</h3>
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-tertiary)]">
            Mock graph showing how prompts flow through jobs to assets within this project.
          </p>
          <div className="mt-4 space-y-0.5">
            {project.graph.map((step, index) => (
              <GraphStep key={step.id} step={step} isLast={index === project.graph.length - 1} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Mock Actions</h3>
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-tertiary)]">
            These actions provide honest UI feedback. No real persistence or provider calls are made.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {project.quickActions.map((action) => {
              const disabled = PROJECT_QUICK_ACTION_DISABLED.has(action);
              return (
                <button
                  key={action}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleAction(action)}
                  className={`inline-flex rounded-[8px] px-4 py-2.5 text-[12px] font-medium transition-colors ${
                    disabled
                      ? "cursor-not-allowed bg-[var(--bg-surface)] text-[var(--text-disabled)]"
                      : "bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-inset)] hover:text-[var(--text-primary)] active:scale-[0.985]"
                  }`}
                >
                  {PROJECT_QUICK_ACTION_LABELS[action]}
                  {disabled ? (
                    <span className="ml-2 rounded-[4px] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9.5px] text-[var(--text-tertiary)]">
                      Disabled
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {actionFeedback ? (
            <div className="mt-4 rounded-[10px] bg-[var(--bg-surface)] px-4 py-3 text-[12px] leading-5 text-[var(--text-secondary)] transition-opacity">
              {actionFeedback}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-[14px] bg-[var(--bg-inset)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Jobs run</span>
            <p className="mt-0.5 text-[14px] font-semibold text-[var(--text-secondary)]">{project.jobIds.length}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Assets linked</span>
            <p className="mt-0.5 text-[14px] font-semibold text-[var(--text-secondary)]">{project.assetIds.length}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Storage</span>
            <p className="mt-0.5 text-[14px] font-semibold text-[var(--text-secondary)]">In-memory only</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudioProjectsPage({ routeMarker }: { routeMarker?: string }) {
  const projects = useMemo(() => getMockProjects(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedProject = selectedId ? projects.find((p) => p.id === selectedId) ?? null : null;

  const filteredActive = projects.filter((p) => p.status === "active");
  const filteredDraft = projects.filter((p) => p.status === "draft");
  const filteredArchived = projects.filter((p) => p.status === "archived");

  return (
    <StudioPageFrame
      eyebrow="PROJECTS"
      routeMarker={routeMarker}
      title="Projects"
      description="Standalone mock project organization surface. Every project card represents a local mock graph connecting prompts, jobs, outputs, and assets. No real persistence or provider calls are made."
      actions={
        <>
          <Link
            href="/studio/canvas"
            className="inline-flex rounded-[9px] bg-[var(--accent)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] active:scale-[0.985]"
          >
            Plan in Canvas
          </Link>
          <Link
            href="/studio/assets"
            className="inline-flex rounded-[9px] bg-[var(--bg-surface)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] active:scale-[0.985]"
          >
            View Assets
          </Link>
        </>
      }
      statusPills={
        <>
          <StudioStatusPill label="Mock project data" tone="mock" />
          <StudioStatusPill label="No persistence · In-memory only" tone="neutral" />
          <StudioStatusPill label="Graph lineage is mock-local" tone="setup" />
        </>
      }
    >
      {selectedProject ? (
        <ProjectDetail project={selectedProject} onClose={() => setSelectedId(null)} />
      ) : null}

      <section className="space-y-5">
        {filteredActive.length > 0 ? (
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] tracking-[-0.01em] text-[var(--text-primary)]">Active</h2>
              <span className="rounded-[5px] bg-[var(--bg-surface)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
                {filteredActive.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredActive.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedId === project.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>
        ) : null}

        {filteredDraft.length > 0 ? (
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] tracking-[-0.01em] text-[var(--text-secondary)]">Drafts</h2>
              <span className="rounded-[5px] bg-[var(--bg-surface)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-tertiary)]">
                {filteredDraft.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredDraft.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedId === project.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>
        ) : null}

        {filteredArchived.length > 0 ? (
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] tracking-[-0.01em] text-[var(--text-muted)]">Archived</h2>
              <span className="rounded-[5px] bg-[var(--bg-surface)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-tertiary)]">
                {filteredArchived.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredArchived.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={selectedId === project.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>
        ) : null}

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] bg-[var(--bg-surface)] px-6 py-16 text-center">
            <p className="text-[13.5px] text-[var(--text-tertiary)]">No mock projects available.</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-[18px] bg-[var(--bg-surface)] px-6 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[15px] text-[var(--text-primary)]">Project Graph Concept</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
              Each project traces a mock lineage: prompt → mock job → output → asset → project.
              This concept is the foundation for Ethen&apos;s creative memory moat.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
            {(["prompt", "job", "output", "asset", "project"] as MockProjectGraphStep["kind"][]).map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-[var(--bg-surface)] text-[10px] font-semibold text-[var(--text-secondary)]">
                  {GRAPH_KIND_LABELS[kind].charAt(0)}
                </span>
                {GRAPH_KIND_LABELS[kind]}
              </span>
            ))}
          </div>
        </div>
      </section>
    </StudioPageFrame>
  );
}


function jobStatusTone(status: string): StudioStatusTone {
  if (status === "completed") return "live";
  if (status === "failed" || status === "canceled" || status === "expired") return "neutral";
  return "mock";
}

function jobStatusLabel(status: string): string {
  switch (status) {
    case "queued": return "Queued";
    case "planning": return "Planning";
    case "running": return "Running";
    case "processing": return "Processing";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "canceled": return "Canceled";
    case "expired": return "Expired";
    case "awaiting_upload": return "Awaiting upload";
    case "awaiting_approval": return "Awaiting approval";
    default: return status;
  }
}

function isFailedNoChargeStatus(status: string): boolean {
  return status === "failed_no_charge" || status === "refunded";
}

export function StudioJobsPage({ routeMarker }: { routeMarker?: string }) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [ledger, setLedger] = useState<Record<string, { settlementStatus?: string; estimatedCredits?: number; chargedCredits?: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/media/jobs?includeLedger=true");
      const json = await res.json();
      if (json.ok) {
        setJobs(json.jobs ?? []);
        const ledgerMap: Record<string, { settlementStatus?: string; estimatedCredits?: number; chargedCredits?: number }> = {};
        if (json.ledger) {
          for (const entry of json.ledger) {
            if (entry.entry) {
              ledgerMap[entry.jobId] = {
                settlementStatus: entry.entry.settlementStatus,
                estimatedCredits: entry.entry.estimatedCredits,
                chargedCredits: entry.entry.chargedCredits,
              };
            }
          }
        }
        setLedger(ledgerMap);
      } else {
        setError(json.error ?? "Failed to load jobs.");
      }
      setLoading(false);
    } catch {
      setError("Network error loading jobs.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await loadJobs();
    }
    if (!cancelled) load();
    return () => { cancelled = true; };
  }, [loadJobs]);

  const showFeedback = useCallback((message: string) => {
    setActionFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setActionFeedback(null), 2800);
  }, []);

  const handleRetry = useCallback(async (jobId: string) => {
    try {
      const res = await fetch("/api/media/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "retry" }),
      });
      const json = await res.json();
      if (json.ok) {
        showFeedback(`Retry job created: ${json.job.id.slice(0, 20)}…`);
        await loadJobs();
      } else {
        showFeedback(json.error ?? "Retry failed.");
      }
    } catch {
      showFeedback("Network error during retry.");
    }
  }, [loadJobs, showFeedback]);

  const activeJobs = jobs.filter((j) => ACTIVE_MEDIA_JOB_STATUSES.includes(j.status) || j.status === "processing" || j.status === "awaiting_upload" || j.status === "awaiting_approval");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed" || j.status === "canceled" || j.status === "expired");

  return (
    <StudioPageFrame
      eyebrow="JOBS"
      routeMarker={routeMarker}
      title="Generation Jobs"
      description="Browse recent media generation jobs with status, progress, and metadata. Jobs persist to local disk and survive server restarts, but are not production-durable cloud storage."
      actions={
        <Link
          href="/studio/assets"
          className="inline-flex rounded-[9px] bg-[var(--bg-surface)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] active:scale-[0.97]"
        >
          View Assets
        </Link>
      }
      statusPills={
        <>
          <StudioStatusPill label="Local disk store — survives restarts" tone="neutral" />
          <StudioStatusPill label={`${jobs.length} total jobs`} tone="neutral" />
          {loading && <StudioStatusPill label="Loading…" tone="mock" />}
          {error && <StudioStatusPill label="Error loading jobs" tone="neutral" />}
        </>
      }
    >
      {loading ? (
        <section className="flex flex-col items-center justify-center rounded-[24px] bg-[var(--bg-surface)] px-6 py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-secondary)]" />
          <p className="mt-4 text-[13px] text-[var(--text-secondary)]">Loading jobs…</p>
        </section>
      ) : error ? (
        <section className="flex flex-col items-center justify-center rounded-[24px] bg-[var(--bg-surface)] px-6 py-20">
          <p className="text-[13px] text-[var(--text-secondary)]">{error}</p>
        </section>
      ) : jobs.length === 0 ? (
        <section className="flex flex-col items-center justify-center gap-3 rounded-[24px] bg-[var(--bg-surface)] px-6 py-20">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-[var(--text-tertiary)]" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          </svg>
          <p className="text-[13px] text-[var(--text-secondary)]">No jobs yet. Generate something in Studio to see jobs appear here.</p>
        </section>
      ) : (
        <div className="space-y-6">
          {activeJobs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] tracking-[-0.01em] text-[var(--text-primary)]">
                Active ({activeJobs.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeJobs.map((job) => (
                  <JobCard key={job.id} job={job} ledgerEntry={ledger[job.id]} onRetry={handleRetry} />
                ))}
              </div>
            </section>
          )}

          {completedJobs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] tracking-[-0.01em] text-[var(--text-primary)]">
                Completed ({completedJobs.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {completedJobs.map((job) => (
                  <JobCard key={job.id} job={job} ledgerEntry={ledger[job.id]} onRetry={handleRetry} />
                ))}
              </div>
            </section>
          )}

          {failedJobs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] tracking-[-0.01em] text-[var(--text-muted)]">
                Failed / Canceled ({failedJobs.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {failedJobs.map((job) => (
                  <JobCard key={job.id} job={job} ledgerEntry={ledger[job.id]} onRetry={handleRetry} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {actionFeedback && (
        <div className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-3 transition animate-in fade-in slide-in-from-bottom-1">
          <p className="text-[12px] text-[var(--text-secondary)]">{actionFeedback}</p>
        </div>
      )}

      <section className="rounded-[18px] bg-[var(--bg-surface)] px-6 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[15px] text-[var(--text-primary)]">Job Lifecycle & Credits</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
              Jobs flow through queued → planning → running → processing → completed.
              Failed, canceled, and expired states are terminal. All jobs are in-memory only in this build.
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
              Failed jobs show &quot;Failed — no charge&quot; when the credit ledger confirms no credits were consumed.
              Retry creates a new queued job from the failed job&apos;s original parameters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            {(["queued", "running", "processing", "completed", "failed"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <StudioStatusPill label={jobStatusLabel(s)} tone={jobStatusTone(s)} />
              </span>
            ))}
          </div>
        </div>
      </section>
    </StudioPageFrame>
  );
}

function JobCard({ job, ledgerEntry, onRetry }: { job: MediaJob; ledgerEntry?: { settlementStatus?: string; estimatedCredits?: number; chargedCredits?: number } | null; onRetry?: (jobId: string) => void }) {
  const tone = jobStatusTone(job.status);
  const isFailed = job.status === "failed" || job.status === "canceled" || job.status === "expired";
  const isCompleted = job.status === "completed";
  const isRetryable = isFailed;
  const isRemixable = isCompleted;
  const settlementStatus = ledgerEntry?.settlementStatus;

  return (
    <div className="rounded-[18px] bg-[var(--bg-surface)] px-4 py-4 transition-colors hover:bg-[var(--bg-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
              {job.prompt
                ? (job.prompt.length > 50 ? `${job.prompt.slice(0, 50)}…` : job.prompt)
                : "No prompt"}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {job.modelName} · {job.modality}
            {job.providerId && job.providerId !== "mock" ? ` · ${job.providerName}` : ""}
          </p>
        </div>
        <StudioStatusPill label={jobStatusLabel(job.status)} tone={tone} className="shrink-0" />
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">Progress</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
              <div
                className="h-full rounded-full bg-[var(--text-secondary)] transition"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-[var(--text-secondary)] tabular-nums">{job.progress}%</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">Provider</span>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {job.providerId === "mock" ? "Mock" : job.providerName ?? job.providerId ?? "Unknown"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">Created</span>
          <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
            {new Date(job.createdAt).toLocaleTimeString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        {job.estimatedCredits != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--text-tertiary)]">Est. credits</span>
            <span className="text-[11px] text-[var(--text-secondary)]">{job.estimatedCredits}</span>
          </div>
        )}
      </div>

      {isFailed && job.error && (
        <div className="mt-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-2">
          <p className="text-[11px] leading-[1.45] text-[var(--text-secondary)]">
            {typeof job.error === "string" ? job.error : job.error.message ?? "Unknown error"}
          </p>
        </div>
      )}

      {isFailed && settlementStatus && (
        <div className={`mt-2 rounded-[10px] px-3 py-2 ${
          isFailedNoChargeStatus(settlementStatus)
            ? "border border-emerald-500/15 bg-emerald-500/5"
            : "border border-amber-500/15 bg-amber-500/5"
        }`}>
          <p className={`text-[11px] leading-[1.45] ${
            isFailedNoChargeStatus(settlementStatus) ? "text-emerald-400/80" : "text-amber-400/80"
          }`}>
            {isFailedNoChargeStatus(settlementStatus)
              ? "Failed — no charge applied. Credits were not consumed."
              : "Failed — provider may have charged. Check provider dashboard."}
          </p>
        </div>
      )}

      {isFailed && !settlementStatus && (
        <div className="mt-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-3 py-2">
          <p className="text-[11px] leading-[1.45] text-[var(--text-secondary)]">
            No charge — mock/setup-required generation. No credits consumed.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isRetryable && onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(job.id);
            }}
            className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-[10px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:scale-[0.96]"
          >
            Retry
          </button>
        )}
        {isRemixable && (
          <Link
            href={`/studio/apps/${job.toolId === "media.generate_video" ? "create-video" : job.toolId === "media.image_to_video" ? "image-to-video" : "create-image"}`}
            className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-[10px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:scale-[0.96]"
          >
            Remix
          </Link>
        )}
        {isCompleted && (
          <>
            <Link
              href="/studio/assets"
              className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-[10px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:scale-[0.96]"
            >
              View Asset
            </Link>
            <button
              type="button"
              className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-[10px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:scale-[0.96]"
            >
              Export
            </button>
          </>
        )}
      </div>
    </div>
  );
}

