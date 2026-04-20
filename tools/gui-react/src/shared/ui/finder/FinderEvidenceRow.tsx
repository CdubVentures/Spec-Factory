/**
 * Standard evidence-row component for scalar finder panels.
 *
 * Renders one row per evidence ref: tier badge + confidence % + source URL.
 * Uniform across all scalar finders (RDF, future SKU/MSRP/UPC) since the
 * `evidence_refs` schema is shared (Phase 3 editorialSchemas).
 *
 * Override via the `renderEvidenceRow` prop on GenericScalarFinderPanel only
 * when a specific finder needs bespoke evidence display.
 */

import type { ReactElement } from 'react';

export interface FinderEvidenceRowSource {
  readonly url: string;
  readonly tier: string;
  readonly confidence: number;
}

function tierTone(tier: string): string {
  if (tier === 'tier1') return 'sf-chip-success';
  if (tier === 'tier2') return 'sf-chip-info';
  if (tier === 'tier3') return 'sf-chip-warning';
  return 'sf-chip-neutral';
}

export function FinderEvidenceRow({ source }: { readonly source: FinderEvidenceRowSource }): ReactElement {
  return (
    <div className="sf-surface-panel border sf-border-soft rounded-md p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`${tierTone(source.tier)} text-[9px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded`}>
          {source.tier}
        </span>
        <span className="text-[10px] font-mono sf-text-muted">
          {source.confidence}%
        </span>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono sf-text-accent hover:underline truncate max-w-full"
          >
            {source.url}
          </a>
        )}
      </div>
    </div>
  );
}
