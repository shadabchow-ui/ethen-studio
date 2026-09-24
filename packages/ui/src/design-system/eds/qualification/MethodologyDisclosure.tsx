"use client";

/**
 * D15-J04 — shared methodology disclosure.
 *
 * No number without method/date/conditions/freshness/source. The disclosure
 * travels with the numbers it describes so provenance can never be separated
 * from the figure. Rendered once per measured section, never per metric.
 */
import * as React from "react";

export interface MethodologyDisclosureProps {
  method: string;
  source: string;
  freshness?: string;
  conditions?: string;
  date?: string;
  id?: string;
}

export function MethodologyDisclosure({
  method,
  source,
  freshness,
  conditions,
  date,
  id,
}: MethodologyDisclosureProps) {
  return (
    <section aria-label="Methodology" className="eds-methodology" id={id}>
      <dl className="eds-methodology__list">
        <div>
          <dt>Method</dt>
          <dd>{method}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{source}</dd>
        </div>
        {freshness ? (
          <div>
            <dt>Freshness</dt>
            <dd>{freshness}</dd>
          </div>
        ) : null}
        {conditions ? (
          <div>
            <dt>Conditions</dt>
            <dd>{conditions}</dd>
          </div>
        ) : null}
        {date ? (
          <div>
            <dt>Date</dt>
            <dd>{date}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
