/**
 * Standard evidence-row component for scalar finder panels.
 *
 * Renders one row per evidence ref: [evidence-kind icon] + tier badge +
 * confidence % + source URL. Uniform across all scalar finders (RDF,
 * future SKU/MSRP/UPC) since the `evidence_refs` schema is shared.
 *
 * When the ref carries evidence_kind (RDF + variantScalarFieldProducer
 * opt-in), the icon is prepended with a hover popover showing the
 * supporting_evidence quote. Legacy base refs (CEF/PIF flows) omit the
 * icon column — no layout shift needed because EvidenceKindTooltip
 * returns null for unknown/missing kinds.
 */

import type { ReactElement } from 'react';
import { EvidenceKindTooltip } from '../feedback/EvidenceKindTooltip';
import type { EvidenceKind } from '../icons/evidenceKindRegistry';
import { formatEvidenceTier } from './evidenceTierLabels';
import { ConfidenceChip } from './ConfidenceChip.tsx';

export interface FinderEvidenceRowSource {
  readonly url: string;
  readonly tier: string;
  readonly confidence: number;
  readonly supporting_evidence?: string;
  readonly evidence_kind?: EvidenceKind | string;
}

function tierTone(tier: string): string {
  if (tier === 'tier1') return 'sf-chip-success';
  if (tier === 'tier2') return 'sf-chip-info';
  if (tier === 'tier3') return 'sf-chip-warning';
  return 'sf-chip-neutral';
}

export function FinderEvidenceRow({ source }: { readonly source: FinderEvidenceRowSource }): ReactElement {
  const isDimmed = source.evidence_kind === 'identity_only';
  return (
    <div
      className={`sf-surface-panel border sf-border-soft rounded-md p-2 flex flex-col gap-1.5 ${isDimmed ? 'opacity-60' : ''}`}
      data-evidence-kind={source.evidence_kind || undefined}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {source.evidence_kind ? (
          <EvidenceKindTooltip
            kind={source.evidence_kind}
            supportingEvidence={source.supporting_evidence}
            tier={source.tier}
            confidence={source.confidence}
            size={14}
          />
        ) : null}
        <span className={`${tierTone(source.tier)} text-[9px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded`}>
          {formatEvidenceTier(source.tier)}
        </span>
        <ConfidenceChip value={source.confidence} hideWhenEmpty={false} />
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
