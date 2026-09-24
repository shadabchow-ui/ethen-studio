"use client";

/**
 * STUDIO_10 — character/product/brand library.
 *
 * Authority §17 Library archetype over the shared StudioLibraryFrame:
 * scope switcher, search, card/table toggle, selection details via the
 * version/rights drawer. Rows render name, origin, version, and
 * consent state — never provider internals.
 */
import { useState } from "react";
import { StudioLibraryFrame } from "../shell/LibraryFrame";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { StudioDataState } from "../shell/types";
import { consentBadgeFor } from "./identity-api-client";
import type { IdentityKind, IdentityListItem } from "./types";
import { VersionRightsDrawer } from "./VersionRightsDrawer";

const KIND_LABEL: Record<Exclude<IdentityKind, "voice">, string> = {
  character: "Characters",
  product: "Products",
  brand: "Brands",
};

export function IdentityLibrary({
  projectId,
  kind,
  state,
  identities,
  search,
  onSearchChange,
  onRetry,
  onToggleFavorite,
}: {
  projectId: string | null;
  kind: Exclude<IdentityKind, "voice">;
  state: StudioDataState;
  identities: IdentityListItem[];
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  onToggleFavorite: (identityId: string, favorite: boolean) => void;
}): React.JSX.Element {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [selected, setSelected] = useState<IdentityListItem | null>(null);

  return (
    <section aria-label={KIND_LABEL[kind]} className="space-y-3">
      <StudioLibraryFrame
        title={KIND_LABEL[kind]}
        scopeLabel={projectId ? "Project library" : "No project selected"}
        searchValue={search}
        searchLabel={`Search ${KIND_LABEL[kind].toLowerCase()}`}
        onSearchChange={onSearchChange}
        view={view}
        onViewChange={setView}
        switcher={[
          { id: "characters", label: "Characters", href: "/studio/identities/characters" },
          { id: "products", label: "Products", href: "/studio/identities/products" },
          { id: "brands", label: "Brands", href: "/studio/identities/brands" },
        ]}
        activeSwitcherId={kind === "character" ? "characters" : kind === "product" ? "products" : "brands"}
        selectionCount={0}
        state={state === "ready" && identities.length === 0 ? "empty" : state}
        emptyProps={{
          title: `No ${KIND_LABEL[kind].toLowerCase()} yet`,
          description: `Create a ${kind} to pin reference-safe immutable versions for reuse across tools.`,
          testId: "identity-empty-state",
        }}
        errorProps={
          state === "permission"
            ? { title: "Library needs project access", description: "Sign in with a project member account." }
            : state === "setup"
              ? {
                  title: "Pick a project first",
                  description: "Identity libraries are project-scoped.",
                  secondaryLabel: "Go to projects",
                  secondaryHref: "/studio/projects",
                }
              : {
                  title: "Library is unavailable",
                  description: "The library could not be loaded. Retry to reload.",
                  retryLabel: "Retry",
                  onRetry,
                }
        }
        onRetry={onRetry}
      >
        {view === "cards" ? (
          <ul aria-label={KIND_LABEL[kind]} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {identities.map((identity) => {
              const badge = consentBadgeFor(identity.consent);
              const initial = (identity.name.trim().slice(0, 1) || "?").toUpperCase();
              return (
                <li key={identity.identityId} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5">
                  <button
                    type="button"
                    onClick={() => setSelected(identity)}
                    aria-label={`Open ${identity.name} versions and rights`}
                    className={`block min-h-[44px] w-full rounded-[8px] text-left ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[var(--bg-inset)] text-[15px] font-semibold text-[var(--text-secondary)]">
                        {initial}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-[var(--text-primary)]">{identity.name}</span>
                        <span className="mt-0.5 block text-[11.5px] text-[var(--text-tertiary)]">
                          {identity.origin} · Version {identity.currentVersion}
                        </span>
                      </span>
                    </span>
                    <span className="mt-2 inline-flex rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                      {badge.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(identity.identityId, !identity.favorite)}
                    aria-pressed={identity.favorite}
                    aria-label={identity.favorite ? `Remove ${identity.name} from favorites` : `Add ${identity.name} to favorites`}
                    className={`mt-1 inline-flex min-h-[44px] items-center rounded-[8px] px-2 text-[12px] font-medium ${STUDIO_FOCUS_RING_CLASS} ${
                      identity.favorite ? "text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {identity.favorite ? "Saved" : "Save"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--border-default)]">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                <th scope="col" className="px-2 py-2 font-semibold">Name</th>
                <th scope="col" className="px-2 py-2 font-semibold">Origin</th>
                <th scope="col" className="px-2 py-2 font-semibold">Version</th>
                <th scope="col" className="px-2 py-2 font-semibold">Rights</th>
                <th scope="col" className="px-2 py-2 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {identities.map((identity) => {
                const badge = consentBadgeFor(identity.consent);
                return (
                  <tr key={identity.identityId} className="border-t border-[var(--border-default)]">
                    <td className="px-2 py-2 font-medium text-[var(--text-primary)]">{identity.name}</td>
                    <td className="px-2 py-2 text-[var(--text-secondary)]">{identity.origin}</td>
                    <td className="px-2 py-2 text-[var(--text-secondary)]">{identity.currentVersion}</td>
                    <td className="px-2 py-2 text-[var(--text-secondary)]">{badge.label}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setSelected(identity)}
                        className={`inline-flex min-h-[44px] items-center rounded-[8px] px-2 text-[12px] text-[var(--text-secondary)] underline-offset-2 hover:underline ${STUDIO_FOCUS_RING_CLASS}`}
                      >
                        Versions &amp; rights
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </StudioLibraryFrame>
      <VersionRightsDrawer
        key={selected ? selected.identityId : "closed"}
        projectId={projectId}
        identity={selected}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
