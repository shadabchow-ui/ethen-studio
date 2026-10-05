/**
 * Legal V1 (2026-10-05): expose the Ethen Terms of Service and Privacy
 * Policy on the sign-in and sign-up surfaces (legal-v1 F-ID-03 / C-03).
 *
 * Deliberately a plain notice with links, not an acceptance mechanism:
 * no checkbox and no "by continuing you agree" wording, because the
 * sign-up acceptance mechanism is an open owner/counsel decision (OD-09).
 * Rendered outside the Clerk component, so the auth flow is untouched.
 */
const LEGAL_ORIGIN = "https://upcube.ai";

const linkStyle = { textDecoration: "underline", textUnderlineOffset: 2 } as const;

export function AuthLegalLinks({ intent }: { intent: "sign-in" | "sign-up" }) {
  return (
    <p
      data-testid="auth-legal-links"
      style={{ maxWidth: 400, fontSize: 12, lineHeight: 1.5, textAlign: "center", opacity: 0.75 }}
    >
      {intent === "sign-up" ? "Before you create an account, read the Ethen " : "Ethen "}
      <a href={`${LEGAL_ORIGIN}/legal/terms`} style={linkStyle}>
        Terms of Service
      </a>{" "}
      and{" "}
      <a href={`${LEGAL_ORIGIN}/legal/privacy`} style={linkStyle}>
        Privacy Policy
      </a>
      {intent === "sign-up" ? "." : ". "}
      {intent === "sign-in" ? (
        <a href={`${LEGAL_ORIGIN}/legal`} style={linkStyle}>
          Legal &amp; Trust Center
        </a>
      ) : null}
    </p>
  );
}
