import { RouteSkeleton } from "@/components/ui/state-surfaces";

/**
 * RC11 — workbench content-area skeleton. Sibling navigations inside
 * (workbench) swap the content region to this instantly while the new
 * route loads; the chrome above (rail, sidebar, topbar) never remounts.
 */
export default function StudioWorkbenchLoading() {
  return <RouteSkeleton category="workspace" label="Loading Studio section" />;
}
