// WHY: Composes EvidenceKindIcon + Radix Tooltip to render the
// hoverable per-ref popover the review drawer / evidence panel / RDF
// run-history use to surface the supporting_evidence quote without
// spending row width on it. Trigger: the icon. Popover: kind label +
// quote/reasoning + tier + confidence + optional Copy-Quote button.

import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { EvidenceKindIcon } from '../icons/EvidenceKindIcon';
import {
  EVIDENCE_KIND_VERBATIM,
  evidenceKindLabel,
  type EvidenceKind,
} from '../icons/evidenceKindRegistry';

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
    } catch { /* clipboard denied — silent fail, button stays */ }
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
          className="sf-evidence-kind-popover max-w-[320px] p-3 rounded-md border sf-border-soft sf-surface-panel shadow-md text-[12px] leading-snug"
          side="top"
          sideOffset={6}
        >
          <div className="flex items-center gap-2 mb-2">
            <EvidenceKindIcon kind={kind} size={14} />
            <span className="font-semibold">{label}</span>
            {tier ? (
              <span className="font-mono text-[10px] px-1 py-0.5 rounded sf-chip-neutral">{tier}</span>
            ) : null}
            {typeof confidence === 'number' ? (
              <span className="font-mono text-[10px] px-1 py-0.5 rounded sf-chip-success">{confidence}%</span>
            ) : null}
          </div>

          {isIdentityOnly ? (
            <div className="text-[11px] sf-text-muted italic">
              URL cited only to establish the product SKU. Does not count toward the evidence threshold.
            </div>
          ) : quote ? (
            <div className="text-[12px] whitespace-pre-wrap break-words">
              {EVIDENCE_KIND_VERBATIM.has(kind as EvidenceKind) ? `“${quote}”` : quote}
            </div>
          ) : (
            <div className="text-[11px] sf-text-muted italic">
              No supporting_evidence recorded for this ref.
            </div>
          )}

          {canCopyQuote ? (
            <button
              type="button"
              onClick={handleCopy}
              className="mt-2 text-[11px] px-2 py-1 rounded border sf-border-soft hover:sf-surface-alt transition"
            >
              {copied ? 'Copied!' : 'Copy quote'}
            </button>
          ) : null}

          <Tooltip.Arrow className="sf-evidence-kind-popover-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
