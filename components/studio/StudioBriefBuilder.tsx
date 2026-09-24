"use client";

export interface StudioBriefBuilderValues {
  audience: string;
  hook: string;
  cta: string;
  claimNotes: string;
}

interface StudioBriefBuilderProps {
  audienceLabel?: string;
  values: StudioBriefBuilderValues;
  onChange: (field: keyof StudioBriefBuilderValues, value: string) => void;
  sourceHandlingNote?: string | null;
}

const INPUT_CLASS =
  "w-full rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:bg-[var(--bg-elevated)]";

export function StudioBriefBuilder({
  audienceLabel = "Audience",
  values,
  onChange,
  sourceHandlingNote,
}: StudioBriefBuilderProps) {
  return (
    <section className="studio-jet-panel space-y-3 rounded-[20px] px-4 py-4">
      <div className="space-y-1">
        <h2 className="text-[12px] font-medium tracking-wide text-[var(--text-tertiary)]">Brief Builder</h2>
        <p className="text-[11px] leading-5 text-[var(--text-tertiary)]">
          Build a structured ad brief before generating prompt packs. Generated copy and visuals still need human review.
        </p>
      </div>

      {sourceHandlingNote ? (
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
          {sourceHandlingNote}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="studio-brief-audience" className="text-[11px] text-[var(--text-tertiary)]">
          {audienceLabel}
        </label>
        <input
          id="studio-brief-audience"
          type="text"
          value={values.audience}
          onChange={(event) => onChange("audience", event.target.value)}
          placeholder="Who is this for?"
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="studio-brief-hook" className="text-[11px] text-[var(--text-tertiary)]">
          Hook
        </label>
        <textarea
          id="studio-brief-hook"
          value={values.hook}
          onChange={(event) => onChange("hook", event.target.value)}
          placeholder="What should land in the first frame?"
          rows={3}
          className={`${INPUT_CLASS} resize-none`}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="studio-brief-cta" className="text-[11px] text-[var(--text-tertiary)]">
          CTA
        </label>
        <input
          id="studio-brief-cta"
          type="text"
          value={values.cta}
          onChange={(event) => onChange("cta", event.target.value)}
          placeholder="What should the audience do next?"
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="studio-brief-claims" className="text-[11px] text-[var(--text-tertiary)]">
          Claim review focus
        </label>
        <textarea
          id="studio-brief-claims"
          value={values.claimNotes}
          onChange={(event) => onChange("claimNotes", event.target.value)}
          placeholder="List any claims, offers, certifications, or pricing that need extra review."
          rows={3}
          className={`${INPUT_CLASS} resize-none`}
        />
      </div>
    </section>
  );
}
