// WHY: Composes EvidenceKindIcon + Radix Tooltip to render the
// hoverable per-ref popover the review drawer / evidence panel / RDF
// run-history use to surface the supporting_evidence quote without
// spending row width on it. Trigger: the icon. Popover: kind label +
// quote/reasoning + tier + confidence + optional Copy-Quote button.
//
// Inherits the `.sf-action-tooltip` stylesheet rule (z-index: 120,
// theme-aware background, shadow, border). The drawer overlay sits
// below that z-index, so the popover paints above it.

import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { EvidenceKindIcon } from '../icons/EvidenceKindIcon';
import {
  EVIDENCE_KIND_VERBATIM,
  evidenceKindLabel,
  type EvidenceKind,
} from '../icons/evidenceKindRegistry';
import { formatEvidenceTier } from '../finder/evidenceTierLabels';

interface EvidenceKindTooltipProps {
  kind: EvidenceKind | string | null | undefined;
  supportingEvidence?: string | null;
  tier?: string | null;
  confidence?: number | null;
  size?: number;
  className?: string;
}

export function EvidenceKindTooltip({
  kind,
  supportingEvidence,
  tier,
  confidence,
  size = 14,
  className,
}: EvidenceKindTooltipProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  if (!kind || typeof kind !== 'string') return null;
  const label = evidenceKindLabel(kind);
  if (!label) return null;

  const quote = typeof supportingEvidence === 'string' ? supportingEvidence.trim() : '';
  const isIdentityOnly = kind === 'identity_only';
  const canCopyQuote = EVIDENCE_KIND_VERBATIM.has(kind as EvidenceKind) && quote.length > 0;

  async function handleCopy() {
    if (!quote) return;
    try {
      await navigator.clipboard.writeText(quote);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — silent fail, button stays */
    }
  }

  return (
    <Tooltip.Root delayDuration={180}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={`Evidence kind: ${label}`}
          className={`sf-evidence-kind-trigger inline-flex items-center justify-center shrink-0 ${className || ''}`}
        >
          <EvidenceKindIcon kind={kind} size={size} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="sf-action-tooltip sf-evidence-kind-popover"
          side="top"
          sideOffset={6}
        >
          <div className="sf-evidence-kind-popover__header">
            <EvidenceKindIcon kind={kind} size={14} />
            <span className="sf-evidence-kind-popover__label">{label}</span>
            {tier ? <span className="sf-chip-neutral sf-evidence-kind-popover__chip">{formatEvidenceTier(tier)}</span> : null}
            {typeof confidence === 'number' ? (
              <span className="sf-chip-success sf-evidence-kind-popover__chip">{confidence}%</span>
            ) : null}
          </div>

          {isIdentityOnly ? (
            <div className="sf-evidence-kind-popover__note">
              URL cited only to establish the product SKU. Does not count toward the evidence threshold.
            </div>
          ) : quote ? (
            <div className="sf-evidence-kind-popover__body">
              {EVIDENCE_KIND_VERBATIM.has(kind as EvidenceKind) ? `“${quote}”` : quote}
            </div>
          ) : (
            <div className="sf-evidence-kind-popover__note">
              No supporting_evidence recorded for this ref.
            </div>
          )}

          {canCopyQuote ? (
            <button
              type="button"
              onClick={handleCopy}
              className="sf-evidence-kind-popover__copy"
            >
              {copied ? 'Copied!' : 'Copy quote'}
            </button>
          ) : null}

          <Tooltip.Arrow className="sf-action-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
