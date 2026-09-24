import * as React from "react";
import { cn } from "../lib/utils";
import type { AccessStatePresentation } from "@ethen/contracts/platform/access-state";

/** EDS metadata pill — same layout contract as the V2 metadata it replaces. */
function EdsMetadata({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center rounded-full border border-[var(--eds-rule-hair)] px-2 text-[12px] text-[var(--eds-text-secondary)]",
        className,
      )}
      {...props}
    />
  );
}

export function ProductAccessStateSurface({
  state,
  revealHttpStatus = true,
  className,
}: {
  state: AccessStatePresentation;
  revealHttpStatus?: boolean;
  className?: string;
}) {
  return (
    <main
      data-ethen-v2
      data-access-state={state.kind}
      data-access-code={state.code}
      data-v2-pattern="access-state"
      className={cn("flex min-h-full w-full items-center justify-center bg-[var(--eds-canvas)] p-6", className)}
    >
      <section
        role="status"
        aria-labelledby="access-state-title"
        className="w-full max-w-[440px] rounded-[var(--eds-radius-raised)] border border-[var(--eds-rule)] bg-[var(--eds-elevated)] p-6 shadow-[var(--eds-elev-overlay-shadow)]"
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {revealHttpStatus ? <EdsMetadata>{state.httpLabel}</EdsMetadata> : null}
          {state.productLabel ? <EdsMetadata>{state.productLabel}</EdsMetadata> : null}
          <EdsMetadata>{state.code}</EdsMetadata>
        </div>
        <h1 id="access-state-title" className="text-[20px] font-medium leading-7 text-[var(--eds-ink)]">
          {state.title}
        </h1>
        <p className="mt-2 block text-[13px] text-[var(--eds-text-secondary)]">{state.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={state.primaryAction.href}
            className="inline-flex h-10 items-center justify-center rounded-[var(--eds-radius-base)] bg-[var(--eds-ink)] px-4 text-[13px] font-medium text-[var(--eds-canvas)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--eds-lapis-strong)]"
          >
            {state.primaryAction.label}
          </a>
          {state.secondaryAction ? (
            <a
              href={state.secondaryAction.href}
              className="inline-flex h-10 items-center justify-center rounded-[var(--eds-radius-base)] border border-[var(--eds-rule)] px-4 text-[13px] font-medium text-[var(--eds-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--eds-lapis-strong)]"
            >
              {state.secondaryAction.label}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
