export type EnvironmentLike = Readonly<Record<string, string | undefined>>;

/**
 * Dev-only switch for rendering product UI during design closure.
 *
 * This never activates in production and should only be used to bypass
 * page-availability presentation gates. API routes, agent launch routes,
 * provider calls, billing, publishing, and other side effects remain gated.
 */
export function isLocalDesignPreviewEnabled(
  environment: EnvironmentLike = process.env,
): boolean {
  return (
    environment.ETHEN_LOCAL_DESIGN_PREVIEW === "true" &&
    environment.NODE_ENV === "development" &&
    environment.VERCEL_ENV !== "production"
  );
}

/**
 * True only for local UI routes. Explicitly excludes API and agent-launch
 * namespaces so local design preview cannot become an execution bypass.
 */
export function isLocalDesignPreviewUiPath(
  pathname: string,
  environment: EnvironmentLike = process.env,
): boolean {
  if (!isLocalDesignPreviewEnabled(environment)) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/agents/")) return false;
  return true;
}
