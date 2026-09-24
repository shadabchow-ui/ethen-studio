"use client";

/**
 * STUDIO_10 — identities route adapter (client): characters, products,
 * brands. One adapter for the three library kinds; unknown kinds fall
 * back to characters with an explicit notice, never a blank page.
 */
import { useStudioIdentity } from "../../studio-project-scope";
import { useState } from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import { IdentityLibrary } from "./IdentityLibrary";
import type { IdentityKind } from "./types";
import { useIdentityLibrary } from "./useIdentityLibrary";
import { STUDIO_PAGE_CLASS } from "../shell/tokens";

type LibraryKind = Exclude<IdentityKind, "voice">;

const KIND_TITLES: Record<LibraryKind, string> = {
  character: "Characters",
  product: "Products",
  brand: "Brands",
};

export function StudioIdentitiesRouteAdapter({ kind }: { kind: string }): React.JSX.Element {
  const resolved: LibraryKind = kind === "products" || kind === "product"
    ? "product"
    : kind === "brands" || kind === "brand"
      ? "brand"
      : "character";
  // V5 M1: canonical active project (URL override applied by the provider).
  const { identity } = useStudioIdentity();
  const projectId = identity.projectId;
  const [search, setSearch] = useState("");
  const library = useIdentityLibrary({ projectId, kind: resolved, tab: "my", search });

  return (
    <div className={`${STUDIO_PAGE_CLASS} space-y-4`}>
      <StudioPageHeader
        eyebrow="Studio"
        title={KIND_TITLES[resolved]}
        description="Reusable identity versions with explicit rights. New versions append; history never rewrites."
      />
      <IdentityLibrary
        projectId={projectId}
        kind={resolved}
        state={library.state}
        identities={library.identities}
        search={search}
        onSearchChange={setSearch}
        onRetry={library.reload}
        onToggleFavorite={(identityId, favorite) => {
          void library.toggleFavorite(identityId, favorite);
        }}
      />
    </div>
  );
}
