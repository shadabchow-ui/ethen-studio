import { notFound, redirect } from "next/navigation";

/**
 * RC5 — identity-kind route resolution for
 * `/studio/identities/[kind]`. Unknown kinds 404 instead of silently
 * rendering Characters; voice kinds converge on the voices library.
 * Split out so the check is unit-testable and the page keeps its live
 * datasource classification.
 */
const VALID_IDENTITY_KINDS = new Set(["characters", "products", "brands", "product", "brand"]);

export function resolveIdentityKind(kind: string): string {
  if (kind === "voices" || kind === "voice") redirect("/studio/voices");
  if (!VALID_IDENTITY_KINDS.has(kind)) notFound();
  return kind;
}
