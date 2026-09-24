import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
// Studio V3 Job 1 — scoped theme import for the shared Chat chrome: the same
// Chat token vars Chat loads (tokens only, no chrome, single source).
import "@ethen/ui/styles/eds/chat-tokens.css";
// V5 M1 — Studio-scoped charcoal console tokens + flush frame (after the
// shared token sheets so the Studio scope wins).
import "./studio/studio-theme.css";
import { EthenDocument, EthenAuthProvider } from "@ethen/app-shell";
import { EthenRumNext } from "@ethen/app-shell/instant-rum/next";
import { STUDIO_RUM_ROUTES } from "@ethen/contracts/rum/route-identity";
import { metadataBaseUrl } from "@ethen/security/canonical-origin";
import { StudioLifecycle } from "@/components/studio/StudioLifecycle";
import { StudioForceDark, STUDIO_FORCE_DARK_SCRIPT } from "@/components/studio/StudioForceDark";

const appUrl = metadataBaseUrl().toString();

/**
 * Studio deployable document.
 *
 * Chrome, fonts, theme bootstrap and auth come from the shared foundation in
 * `@ethen/app-shell`, so this zone renders identically to the monolith.
 * Metadata is product-specific and stays here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Ethen Studio", template: "%s" },
  description: "Ethen Studio — canonical creative product surface.",
  applicationName: "Ethen",
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/icon.png" },
};

export default async function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <EthenAuthProvider nonce={nonce}>
      <EthenDocument
        nonce={nonce}
        registrations={
          // V5 M1 — pin Studio to the dark console before first paint.
          <script
            id="ethen-studio-force-dark"
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: STUDIO_FORCE_DARK_SCRIPT }}
          />
        }
      >
        <StudioForceDark />
        {/* Pass 2: single session-wide RUM collector + route focus. Mounted
          here (not in the workbench layout) so measurement and focus
          survive workbench ↔ non-workbench transitions; the shell marker
          stays on the workbench chrome, which honestly reports absence
          outside it. */}
        <StudioLifecycle />
        <EthenRumNext
          app="studio"
          product="studio"
          releaseSha={process.env.NEXT_PUBLIC_RELEASE_SHA ?? "dev-local"}
          endpoint={process.env.NEXT_PUBLIC_RUM_ENDPOINT ?? "/api/rum"}
          routes={STUDIO_RUM_ROUTES}
          enabled={process.env.NEXT_PUBLIC_RUM_ENABLED === "1"}
          sampleRate={1}
        />
        {children}
      </EthenDocument>
    </EthenAuthProvider>
  );
}
