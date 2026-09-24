import type { ReactNode } from "react";

import { documentFontClassName } from "@ethen/ui/design-tokens/typography/document-fonts";
import { ToastProvider } from "@ethen/ui/toast";
import { ThemeHydrationSync } from "@ethen/ui/theme/theme-hydration-sync";
import { THEME_BOOTSTRAP_SCRIPT } from "@ethen/ui/theme/theme-store";

/**
 * `EthenDocument` — the shared document chrome (B1).
 *
 * Every deployable renders the same `<html>/<head>/<body>` shell: the D15-J07R
 * font stack, the theme bootstrap script, the toast provider and the theme
 * hydration sync. Moved verbatim from the root layout so rendered output is
 * byte-identical; only its home changed.
 *
 * Product-specific concerns (metadata, auth wiring, slot registration) stay
 * with the host and are supplied as props.
 */

export interface EthenDocumentProps {
  /** CSP nonce for the inline theme bootstrap. */
  nonce: string;
  /**
   * Host-supplied registration nodes (e.g. app-shell slot registration).
   * Rendered first inside `<body>`, before any provider.
   */
  registrations?: ReactNode;
  children: ReactNode;
}

export function EthenDocument({ nonce, registrations, children }: EthenDocumentProps) {
  return (
    <html lang="en" suppressHydrationWarning className={documentFontClassName}>
      <head>
        {/* The browser strips/hides the `nonce` content attribute once CSP has
            consumed it, so the live DOM legitimately differs from the server
            HTML here. Without suppression React treats that as a mismatch and
            regenerates the tree on EVERY page load. Suppressing does not
            weaken CSP: the real nonce is still emitted and still enforced. */}
        <script
          id="ethen-theme-init"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="h-full">
        {registrations}
        <ToastProvider>
          <ThemeHydrationSync />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
