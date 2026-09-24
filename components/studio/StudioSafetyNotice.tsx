import { cn } from "@/lib/utils";

export type SafetyNoticeKind =
  | "mock"
  | "consent-required"
  | "needs-review"
  | "setup-required"
  | "blocked"
  | "claim-caution"
  | "identity-disclaimer";

export interface StudioSafetyNoticeProps {
  kind: SafetyNoticeKind;
  title?: string;
  description?: string;
  steps?: string[];
  className?: string;
}

const NOTICE_CONFIGS: Record<
  SafetyNoticeKind,
  { icon: string; defaultTitle: string; defaultDescription: string; defaultSteps?: string[] }
> = {
  mock: {
    icon: "○",
    defaultTitle: "Sample Preview — Not a Real Generation",
    defaultDescription:
      "This is a Studio sample preview. No provider is connected and no real media has been generated. Results shown here are sample outputs for demonstration only. No backend moderation or safety enforcement is active.",
  },
  "consent-required": {
    icon: "◇",
    defaultTitle: "Consent Required",
    defaultDescription:
      "This workflow involves identity, likeness, voice, or character media. Ethen Studio requires explicit consent before generating content that involves a real person's face, voice, or likeness.",
    defaultSteps: [
      "Read: Understand what this workflow will create and which inputs are used.",
      "Propose: Review the planned output, confirm you have permission to use the source media.",
      "Execute: After confirmation, generation will proceed with audit trace.",
    ],
  },
  "needs-review": {
    icon: "◐",
    defaultTitle: "Needs Review",
    defaultDescription:
      "This output should be reviewed before publishing or sharing. It may involve marketing claims, product representations, or public-facing content that requires human oversight.",
  },
  "setup-required": {
    icon: "◌",
    defaultTitle: "Setup Required",
    defaultDescription:
      "This feature requires additional provider configuration or credentials before it can be used. No real generation can occur until setup is complete.",
  },
  blocked: {
    icon: "⊗",
    defaultTitle: "Unavailable",
    defaultDescription:
      "This capability is currently unavailable in Ethen Studio. It may involve workflows that require additional policy, safety, or provider readiness before activation.",
  },
  "claim-caution": {
    icon: "◈",
    defaultTitle: "Product Claim Caution",
    defaultDescription:
      "Content generated for marketing or product ad workflows should be reviewed for accuracy. Ethen Studio does not automatically verify product claims. Ensure that generated copy and visuals are truthful, substantiated, and compliant with applicable advertising standards.",
  },
  "identity-disclaimer": {
    icon: "◊",
    defaultTitle: "Identity & Likeness Disclaimer",
    defaultDescription:
      "This workflow generates synthetic characters or influencer-style content. Do not use it to impersonate real individuals, create deceptive endorsements, or generate non-consensual imagery. Ethen Studio audit traces log every generation for provenance.",
  },
};

export function StudioSafetyNotice({ kind, title, description, steps, className }: StudioSafetyNoticeProps) {
  const config = NOTICE_CONFIGS[kind];

  const displayTitle = title ?? config.defaultTitle;
  const displayDescription = description ?? config.defaultDescription;
  const displaySteps = steps ?? config.defaultSteps;

  return (
    <section
      className={cn(
        "studio-jet-panel rounded-[18px] px-5 py-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 shrink-0 text-[16px] leading-none text-[var(--text-muted)] select-none"
          aria-hidden
        >
          {config.icon}
        </span>
        <div className="min-w-0 space-y-2.5">
          <h3 className="text-[13px] text-[var(--text-primary)]">{displayTitle}</h3>
          <p className="text-[12px] leading-6 text-[var(--text-secondary)]">{displayDescription}</p>

          {displaySteps && displaySteps.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              {displaySteps.map((step, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-[3px] shrink-0 text-[10px] font-medium text-[var(--text-muted)] select-none">
                    {index + 1}
                  </span>
                  <span className="text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">{step}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function StudioConsentGate({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "studio-jet-panel rounded-[18px] px-5 py-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 shrink-0 text-[16px] leading-none text-[var(--text-muted)] select-none"
          aria-hidden
        >
          ◇
        </span>
        <div className="min-w-0 space-y-2.5">
          <h3 className="text-[13px] text-[var(--text-primary)]">Read → Propose → Execute</h3>
          <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
            Ethen Studio follows a consent-first approach for identity, likeness, and voice workflows.
            This means the system will analyze your intent, propose the planned output, and only
            generate after explicit confirmation.
          </p>
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-2">
              <span className="mt-[3px] shrink-0 rounded-[4px] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                Read
              </span>
              <span className="text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                Analyze your request, uploaded media, and risk category. Detect whether real identity, likeness,
                or voice data is involved.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-[3px] shrink-0 rounded-[4px] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                Propose
              </span>
              <span className="text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                Show exactly what will happen, what consent is required, and any policy limitations.
                Ask for explicit confirmation.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-[3px] shrink-0 rounded-[4px] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                Execute
              </span>
              <span className="text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                Generate only after consent and approval are confirmed. Store audit trace, moderation
                result, and provider metadata.
              </span>
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
