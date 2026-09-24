"use client";

/**
 * Studio V3 Job 4 — durable creative entity library (Characters/Products/Brands).
 *
 * Project-scoped CRUD over the entities API: create with client-generated
 * idempotency keys, revision-guarded updates (409 surfaces a refresh +
 * retry affordance, never a silent overwrite), soft delete, reference
 * asset attachment, rules/preferences editing, and generation history with
 * approved outputs. Cross-project access is denied server-side.
 */

import { useCallback, useEffect, useState } from "react";
import { useStudioSwitches } from "./use-studio-workspace-hooks";

export type EntityKind = "character" | "product" | "brand";

export interface EntityRow {
  id: string;
  kind: EntityKind;
  name: string;
  status: string;
  revision: number;
  referenceAssetIds: string[];
  rules: { preserve?: string[]; change?: string[]; target?: string[] };
  preferences: { views?: string[]; styling?: string[]; notes?: string };
  history: Array<{ jobId: string; label: string; at?: string }>;
  approvedOutputIds: string[];
}

const KIND_LABEL: Record<EntityKind, string> = { character: "Character", product: "Product", brand: "Brand" };

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(path, init);
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

const inputClass = "w-full rounded-[8px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)]";

export function StudioEntityLibrary({ projectId, kind }: { projectId: string; kind: EntityKind }) {
  const switches = useStudioSwitches();
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [edit, setEdit] = useState<{ name: string; notes: string; preserve: string; change: string } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const fetchList = useCallback(() => {
    const ticket = switches.issue("panel", `${projectId}:${kind}`);
    void api(`/api/media/entities/${kind}?projectId=${encodeURIComponent(projectId)}`, { signal: ticket.signal })
      .then(({ body }) => {
        switches.commitIfCurrent("panel", ticket, () => {
          const list = Array.isArray(body.entities) ? (body.entities as EntityRow[]) : [];
          setEntities(list);
          setState("ready");
          setError(null);
        });
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        switches.commitIfCurrent("panel", ticket, () => {
          setState("error");
          setError("Entity listing is unavailable.");
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, kind]);

  const reload = useCallback(() => {
    setState("loading");
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const selected = entities.find((entity) => entity.id === selectedId) ?? null;

  // Render-time adjustment (no effect): the edit draft follows the selected
  // entity revision, so a 409 refresh re-seeds the form deterministically.
  const [editFor, setEditFor] = useState<string | null>(null);
  const selectedKey = selected ? `${selected.id}:${selected.revision}` : null;
  if (editFor !== selectedKey) {
    setEditFor(selectedKey);
    setConflict(null);
    setEdit(
      selected
        ? {
          name: selected.name,
          notes: selected.preferences.notes ?? "",
          preserve: (selected.rules.preserve ?? []).join(", "),
          change: (selected.rules.change ?? []).join(", "),
        }
        : null,
    );
  }

  const create = useCallback(() => {
    const name = draftName.trim();
    if (!name) return;
    void api(`/api/media/entities/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
      body: JSON.stringify({ projectId, name }),
    }).then(({ status, body }) => {
      if (status >= 400) {
        setError(typeof body.error === "string" ? body.error : "Entity creation failed.");
        return;
      }
      setDraftName("");
      reload();
    });
  }, [draftName, kind, projectId, reload]);

  const save = useCallback(() => {
    if (!selected || !edit) return;
    setConflict(null);
    void api(`/api/media/entities/${kind}/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
      body: JSON.stringify({
        projectId,
        expectedRevision: selected.revision,
        name: edit.name,
        preferences: { ...selected.preferences, notes: edit.notes },
        rules: {
          ...selected.rules,
          preserve: edit.preserve.split(",").map((s) => s.trim()).filter(Boolean),
          change: edit.change.split(",").map((s) => s.trim()).filter(Boolean),
        },
      }),
    }).then(({ status, body }) => {
      if (status === 409) {
        setConflict("Someone else updated this entity. Reload to see revision " + "latest, then re-apply your change.");
        reload();
        return;
      }
      if (status >= 400) {
        setError(typeof body.error === "string" ? body.error : "Entity update failed.");
        return;
      }
      reload();
    });
  }, [selected, edit, kind, projectId, reload]);

  const remove = useCallback(() => {
    if (!selected) return;
    void api(`/api/media/entities/${kind}/${encodeURIComponent(selected.id)}?projectId=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": newKey() },
    }).then(() => {
      setSelectedId(null);
      reload();
    });
  }, [selected, kind, projectId, reload]);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section aria-label={`${KIND_LABEL[kind]} list`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3">
        <div className="mb-2 flex gap-2">
          <label htmlFor={`entity-new-${kind}`} className="sr-only">New {KIND_LABEL[kind].toLowerCase()} name</label>
          <input id={`entity-new-${kind}`} className={inputClass} placeholder={`New ${KIND_LABEL[kind].toLowerCase()}…`} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          <button type="button" onClick={create} disabled={!draftName.trim()} className="shrink-0 rounded-[8px] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">
            Add
          </button>
        </div>
        {state === "loading" ? <p className="text-[12px] text-[var(--text-tertiary)]" role="status">Loading…</p> : null}
        {state === "error" ? <p className="text-[12px] text-[var(--text-primary)]" role="alert">{error}</p> : null}
        <ul className="space-y-1">
          {entities.map((entity) => (
            <li key={entity.id}>
              <button
                type="button"
                onClick={() => setSelectedId(entity.id)}
                aria-pressed={entity.id === selectedId}
                className={`w-full rounded-[9px] px-3 py-2 text-left ${entity.id === selectedId ? "bg-[var(--bg-elevated)]" : "hover:bg-[var(--bg-surface)]"}`}
              >
                <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{entity.name}</span>
                <span className="block text-[11px] text-[var(--text-tertiary)]">rev {entity.revision} · {entity.referenceAssetIds.length} refs · {entity.history.length} runs</span>
              </button>
            </li>
          ))}
        </ul>
        {state === "ready" && entities.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No {KIND_LABEL[kind].toLowerCase()}s yet — create the first above.</p> : null}
      </section>

      <section aria-label={`${KIND_LABEL[kind]} detail`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
        {!selected || !edit ? (
          <p className="text-[12.5px] text-[var(--text-tertiary)]">Select an entry to inspect identity, rules, references and history.</p>
        ) : (
          <div className="max-w-[560px] space-y-3">
            {conflict ? <p role="alert" className="rounded-[9px] border border-[var(--border-default)] px-3 py-2 text-[12px] text-[var(--text-primary)]">{conflict}</p> : null}
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-medium text-[var(--text-primary)]">{selected.name}</h3>
              <span className="text-[11.5px] text-[var(--text-tertiary)]">rev {selected.revision} · {selected.status}</span>
            </div>
            <label className="block text-[12px] text-[var(--text-secondary)]">Name<input className={`${inputClass} mt-1`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="block text-[12px] text-[var(--text-secondary)]">Notes<textarea className={`${inputClass} mt-1`} rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <label className="block text-[12px] text-[var(--text-secondary)]">Preserve rules (comma separated)<input className={`${inputClass} mt-1`} value={edit.preserve} onChange={(e) => setEdit({ ...edit, preserve: e.target.value })} /></label>
            <label className="block text-[12px] text-[var(--text-secondary)]">Change rules (comma separated)<input className={`${inputClass} mt-1`} value={edit.change} onChange={(e) => setEdit({ ...edit, change: e.target.value })} /></label>
            <div className="text-[12px] text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">Reference assets ({selected.referenceAssetIds.length})</p>
              {selected.referenceAssetIds.length === 0 ? <p className="text-[var(--text-tertiary)]">Attach references from Assets (use-as-reference) in a workspace run.</p> : (
                <ul className="mt-1 list-disc pl-5">{selected.referenceAssetIds.map((id) => <li key={id} className="truncate">{id}</li>)}</ul>
              )}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">Generation history ({selected.history.length})</p>
              {selected.history.length === 0 ? <p className="text-[var(--text-tertiary)]">Runs that name this entity appear here.</p> : (
                <ul className="mt-1 space-y-1">{selected.history.slice(-8).reverse().map((entry) => <li key={`${entry.jobId}-${entry.label}`} className="truncate">{entry.label} · {entry.jobId.slice(0, 8)}</li>)}</ul>
              )}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">Approved outputs ({selected.approvedOutputIds.length})</p>
              {selected.approvedOutputIds.length === 0 ? <p className="text-[var(--text-tertiary)]">Accept outputs in Review to approve them for this entity.</p> : (
                <ul className="mt-1 list-disc pl-5">{selected.approvedOutputIds.map((id) => <li key={id} className="truncate">{id}</li>)}</ul>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={save} className="rounded-[9px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-white">Save revision {selected.revision + 1}</button>
              <button type="button" onClick={remove} className="rounded-[9px] bg-[var(--bg-surface)] px-4 py-2 text-[12.5px] text-[var(--text-primary)]">Delete</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
