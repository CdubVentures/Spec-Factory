// WHY: Registry-driven evidence-kind icons (one per locked enum value).
// The backend evidence-upgrade tags each RDF / scalar-producer evidence_ref
// with evidence_kind; the review drawer + evidence panel + RDF run history
// render this icon prepended to each source row. Hovering opens a popover
// with the supporting_evidence quote (see EvidenceKindTooltip.tsx).
//
// Pattern mirrors LlmProviderIcon.tsx — add a new kind = add one icon fn
// + one map entry (+ matching label/color in evidenceKindRegistry.ts).
// Pure data lives in evidenceKindRegistry.ts so tests don't need JSX.

import type { CSSProperties } from 'react';
import {
  EVIDENCE_KIND_COLOR_CLASS,
  type EvidenceKind,
} from './evidenceKindRegistry';

export type { EvidenceKind };
export {
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KIND_COLOR_CLASS,
  EVIDENCE_KIND_VALUES,
  EVIDENCE_KIND_VERBATIM,
  evidenceKindLabel,
  isEvidenceKind,
} from './evidenceKindRegistry';

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

function DirectQuoteIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 7h4v4H9c0 1.5 1 2.5 2 3v2c-2.5-.5-4-2.5-4-5V7zm8 0h4v4h-2c0 1.5 1 2.5 2 3v2c-2.5-.5-4-2.5-4-5V7z" />
    </svg>
  );
}

function StructuredMetadataIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h-2a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function BylineTimestampIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

function ArtifactMetadataIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function VisualInspectionIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LabMeasurementIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3" />
      <line x1="7" y1="3" x2="17" y2="3" />
      <line x1="7" y1="14" x2="17" y2="14" />
    </svg>
  );
}

function ComparativeRebadgeIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="7 4 3 8 7 12" />
      <line x1="3" y1="8" x2="21" y2="8" />
      <polyline points="17 20 21 16 17 12" />
      <line x1="21" y1="16" x2="3" y2="16" />
    </svg>
  );
}

function InferredReasoningIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21h6" />
      <path d="M10 17h4" />
      <path d="M12 3a6 6 0 0 0-4 10c1 1 2 2 2 4h4c0-2 1-3 2-4a6 6 0 0 0-4-10z" />
    </svg>
  );
}

function AbsenceOfEvidenceIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </svg>
  );
}

function IdentityOnlyIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <line x1="14" y1="10" x2="18" y2="10" />
      <line x1="14" y1="14" x2="18" y2="14" />
    </svg>
  );
}

const EVIDENCE_KIND_ICON_MAP: Record<EvidenceKind, (props: IconProps) => JSX.Element> = {
  direct_quote: DirectQuoteIcon,
  structured_metadata: StructuredMetadataIcon,
  byline_timestamp: BylineTimestampIcon,
  artifact_metadata: ArtifactMetadataIcon,
  visual_inspection: VisualInspectionIcon,
  lab_measurement: LabMeasurementIcon,
  comparative_rebadge: ComparativeRebadgeIcon,
  inferred_reasoning: InferredReasoningIcon,
  absence_of_evidence: AbsenceOfEvidenceIcon,
  identity_only: IdentityOnlyIcon,
};

interface EvidenceKindIconProps {
  kind: EvidenceKind | string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Render the SVG icon for a given evidence_kind. Returns null for
 * legacy / unknown kinds so the caller can fall back gracefully.
 * Applies the color class for the kind unless the caller overrides via `className`.
 */
export function EvidenceKindIcon({ kind, size = 14, className }: EvidenceKindIconProps): JSX.Element | null {
  if (!kind || typeof kind !== 'string') return null;
  const Icon = EVIDENCE_KIND_ICON_MAP[kind as EvidenceKind];
  if (!Icon) return null;
  const colorClass = EVIDENCE_KIND_COLOR_CLASS[kind as EvidenceKind] || '';
  const composed = [colorClass, className].filter(Boolean).join(' ');
  return <Icon size={size} className={composed} />;
}
