/**
 * Shared Ethen account / footer menu — quick navigation only, never a second
 * settings implementation. Chat and Designer render this same component; each
 * may inject product-specific quick items above the shared footer items.
 */
"use client";

import * as React from "react";
import Link from "next/link";

export interface AccountMenuIdentity {
  name?: string | null;
  email?: string | null;
  plan?: string | null;
}

export interface AccountMenuItem {
  id: string;
  label: string;
  detail?: string;
  href?: string;
  onSelect?: () => void;
}

export function AccountMenu({
  signedIn,
  identity,
  productItems = [],
  settingsHref = "/settings",
  usageHref = "/settings?section=billing",
  languageHref = "/settings?section=general",
  onLogout,
  loggingOut = false,
}: {
  signedIn: boolean;
  identity: AccountMenuIdentity | null;
  productItems?: readonly AccountMenuItem[];
  settingsHref?: string;
  usageHref?: string;
  languageHref?: string;
  onLogout: () => void;
  loggingOut?: boolean;
}) {
  const sharedItems: AccountMenuItem[] = [
    { id: "settings", label: "Settings", href: settingsHref },
    { id: "usage", label: "Usage", detail: "Plan and metering", href: usageHref },
    { id: "language", label: "Language", detail: "Interface language", href: languageHref },
    { id: "help", label: "Get help", href: "/help" },
    { id: "apps", label: "Apps & extensions", detail: "Skills, connectors, plugins", href: "/settings?section=skills" },
    { id: "learn", label: "Learn more", detail: "How Ethen protects your data", href: "/settings?section=privacy" },
  ];

  return (
    <div role="menu" aria-label="Account" style={{ display: "grid", gap: 2, minWidth: 240 }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--eds-rule-hair)" }}>
        {signedIn ? (
          <>
            <strong style={{ fontSize: 13 }}>{identity?.name ?? identity?.email ?? "Signed in"}</strong>
            {identity?.plan ? (
              <div style={{ fontSize: 11, color: "var(--eds-text-secondary)" }}>{identity.plan}</div>
            ) : null}
          </>
        ) : (
          <strong style={{ fontSize: 13 }}>Not signed in</strong>
        )}
      </div>
      {productItems.map((item) => (
        <AccountMenuRow key={item.id} item={item} />
      ))}
      {sharedItems.map((item) => (
        <AccountMenuRow key={item.id} item={item} />
      ))}
      <div style={{ borderTop: "1px solid var(--eds-rule-hair)", marginTop: 4, paddingTop: 4 }}>
        {signedIn ? (
          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            onClick={onLogout}
            style={rowStyle}
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        ) : (
          <Link href="/sign-in" role="menuitem" style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}>
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 8,
  cursor: "pointer",
};

function AccountMenuRow({ item }: { item: AccountMenuItem }) {
  const body = (
    <>
      <span style={{ display: "block", fontSize: 13 }}>{item.label}</span>
      {item.detail ? (
        <small style={{ display: "block", fontSize: 11, color: "var(--eds-text-secondary)" }}>{item.detail}</small>
      ) : null}
    </>
  );
  if (item.href) {
    return (
      <a href={item.href} role="menuitem" style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" style={rowStyle} onClick={item.onSelect}>
      {body}
    </button>
  );
}
