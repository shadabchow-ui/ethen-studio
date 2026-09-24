"use client";

/**
 * STUDIO_10 — Voices route adapter (client).
 *
 * Reads projectId from the URL, wires the voice selector to the V1
 * APIs, and hosts the version/rights drawer plus Design/Clone flows.
 * No Suspense requirement: query derivation is external-store free.
 */
import { useStudioIdentity } from "../../studio-project-scope";
import { useCallback, useEffect, useState } from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import type { StudioDataState } from "../shell/types";
import { CloneDesignForms } from "./CloneDesignForms";
import { parseCompatibleResponse } from "./identity-api-client";
import type { CompatibleModelView, IdentityCreationFlow, IdentityLibraryTab, IdentityListItem } from "./types";
import { useIdentityLibrary } from "./useIdentityLibrary";
import { VersionRightsDrawer } from "./VersionRightsDrawer";
import { VoiceSelector } from "./VoiceSelector";
import { STUDIO_PAGE_CLASS } from "../shell/tokens";

export function StudioVoicesRouteAdapter(): React.JSX.Element {
  // V5 M1: canonical active project (URL override applied by the provider).
  const { identity } = useStudioIdentity();
  const projectId = identity.projectId;
  const [tab, setTab] = useState<IdentityLibraryTab>("my");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [drawerIdentity, setDrawerIdentity] = useState<IdentityListItem | null>(null);
  const [flow, setFlow] = useState<IdentityCreationFlow | null>(null);
  const library = useIdentityLibrary({ projectId, kind: "voice", tab, search });
  const [compatible, setCompatible] = useState<CompatibleModelView[]>([]);
  const [compatibleState, setCompatibleState] = useState<StudioDataState | "idle">("idle");
  const [compatibleFor, setCompatibleFor] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !selection) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/studio/v1/identities/compatible?projectId=${encodeURIComponent(projectId)}&identityId=${encodeURIComponent(selection)}&task=speech.synthesize`,
        );
        const parsed = parseCompatibleResponse((await response.json().catch(() => ({}))) as unknown);
        if (cancelled) return;
        setCompatible(parsed.candidates);
        setCompatibleState(parsed.state);
        setCompatibleFor(selection);
      } catch {
        if (cancelled) return;
        setCompatible([]);
        setCompatibleState("error");
        setCompatibleFor(selection);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selection]);

  // Compatibility display follows the current selection by derivation:
  // stale candidates for a previous voice never render as current.
  const shownCompatible = compatibleFor === selection ? compatible : [];
  const shownCompatibleState = selection === null ? ("idle" as const) : compatibleFor === selection ? compatibleState : "loading";

  const handleSelect = useCallback(
    (identityId: string) => {
      library.recordViewed(identityId);
      setSelection(identityId);
    },
    [library],
  );

  return (
    <div className={`${STUDIO_PAGE_CLASS} space-y-4`}>
      <StudioPageHeader
        eyebrow="Studio"
        title="Voices"
        description="Choose a voice identity for speech. Voices and models are selected separately."
        routeMarker="/studio/voices"
      />
      <VoiceSelector
        projectId={projectId}
        state={library.state}
        tab={tab}
        onTabChange={setTab}
        search={search}
        onSearchChange={setSearch}
        voices={library.identities}
        missingFavoriteIds={library.missingFavoriteIds}
        selection={selection}
        onSelect={handleSelect}
        onToggleFavorite={(identityId, favorite) => {
          void library.toggleFavorite(identityId, favorite);
        }}
        onOpenVersions={setDrawerIdentity}
        onDesign={() => setFlow("design")}
        onClone={() => setFlow("clone")}
        compatible={shownCompatible}
        compatibleState={shownCompatibleState}
        onRetry={library.reload}
      />
      <VersionRightsDrawer
        key={drawerIdentity ? drawerIdentity.identityId : "closed"}
        projectId={projectId}
        identity={drawerIdentity}
        onClose={() => setDrawerIdentity(null)}
      />
      <CloneDesignForms
        projectId={projectId}
        flow={flow}
        onClose={() => setFlow(null)}
        onCreated={(identityId) => {
          library.reload();
          setSelection(identityId);
        }}
      />
    </div>
  );
}
