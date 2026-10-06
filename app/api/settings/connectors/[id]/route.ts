import "server-only";

import { notAvailableInStudioResponse } from "../../_lib/clerk-sessions";

/** RC2 — connector disconnect backstop: connectors don't exist in Studio. */
export async function DELETE() {
  return notAvailableInStudioResponse("Connectors");
}
