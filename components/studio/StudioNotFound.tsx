"use client";

/**
 * RC5 — branded Studio 404 body shared by the root and studio-segment
 * not-found pages. Recovery always names a real destination (Home,
 * Explore, Back) — never the bare Next.js 404 template.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STUDIO_CANONICAL_ROUTES } from "@/lib/studio-v5/route-map";

export function StudioNotFound({ context }: { context: string }) {
  const router = useRouter();
  return (
    <div
      data-testid="studio-not-found"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 12,
        padding: "48px 24px",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>
        404 · ETHEN STUDIO
      </p>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: "-0.01em" }}>Page not found</h1>
      <p style={{ margin: 0, maxWidth: 416, fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>
        {context} It may have moved, or the link may be wrong. Pick a destination to keep going.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <Link
          href={STUDIO_CANONICAL_ROUTES.home}
          style={{
            display: "inline-flex",
            minHeight: 44,
            alignItems: "center",
            borderRadius: 10,
            padding: "0 20px",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Go to Studio home
        </Link>
        <Link
          href="/studio/explore"
          style={{
            display: "inline-flex",
            minHeight: 44,
            alignItems: "center",
            borderRadius: 10,
            padding: "0 20px",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Explore creations
        </Link>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            minHeight: 44,
            padding: "0 20px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Go back
        </button>
      </div>
    </div>
  );
}
