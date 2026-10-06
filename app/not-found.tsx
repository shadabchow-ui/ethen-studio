import { StudioNotFound } from "@/components/studio/StudioNotFound";

/** RC5 — branded root 404 with recovery (replaces the bare Next.js template). */
export default function RootNotFound() {
  return <StudioNotFound context="Nothing lives at this address." />;
}
