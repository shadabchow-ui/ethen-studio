"use client";

/**
 * STUDIO_10 — create-tool voice-slot integration.
 *
 * Exposed for STUDIO_09's voice extension slot WITHOUT modifying the
 * create owner (STUDIO_09 has not fully passed, so no binding edits
 * land in v5/create). STUDIO_11 binds this into the audio slots via a
 * recorded handoff. Props mirror CreateVoiceSlotState: the slot holds
 * a VoiceIdentity reference id, never provider blobs or model ids.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { CreateVoiceSlotState } from "../create/types";
import { parseCompatibleResponse } from "./identity-api-client";
import type { CompatibleModelView, IdentityLibraryTab, IdentityListItem } from "./types";
import { useIdentityLibrary } from "./useIdentityLibrary";
import { VersionRightsDrawer } from "./VersionRightsDrawer";
import { VoiceSelector } from "./VoiceSelector";
import type { StudioDataState } from "../shell/types";

export function CreateVoiceSlotBinding({
  projectId,
  value,
  onChange,
}: {
  projectId: string | null;
  value: CreateVoiceSlotState;
  onChange: (next: CreateVoiceSlotState) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<IdentityLibraryTab>("my");
  const [search, setSearch] = useState("");
  const [flow, setFlow] = useState<"design" | "clone" | null>(null);
  const [drawerIdentity, setDrawerIdentity] = useState<IdentityListItem | null>(null);
  const library = useIdentityLibrary({ projectId, kind: "voice", tab, search });
  const [compatible, setCompatible] = useState<CompatibleModelView[]>([]);
  const [compatibleState, setCompatibleState] = useState<StudioDataState | "idle">("idle");
  const [compatibleFor, setCompatibleFor] = useState<string | null>(null);

  const selection = value.voiceIdentityId;

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

  const shownCompatible = compatibleFor === selection ? compatible : [];
  const shownCompatibleState = selection === null ? ("idle" as const) : compatibleFor === selection ? compatibleState : "loading";

  const handleSelect = useCallback(
    (identityId: string) => {
      library.recordViewed(identityId);
      onChange({ voiceIdentityId: identityId, bound: value.bound });
    },
    [library, onChange, value.bound],
  );

  return (
    <div className="space-y-2" data-testid="create-voice-slot-binding">
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
        compact
      />
      <VersionRightsDrawer
        key={drawerIdentity ? drawerIdentity.identityId : "closed"}
        projectId={projectId}
        identity={drawerIdentity}
        onClose={() => setDrawerIdentity(null)}
      />
      {flow ? (
        <p role="status" className="text-[12px] text-[var(--text-tertiary)]">
          Voice {flow} runs in the{" "}
          <Link href="/studio/voices" className={`underline underline-offset-2 hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}>
            Voices library
          </Link>
          ; the slot keeps only the selected identity reference.
        </p>
      ) : null}
    </div>
  );
}
