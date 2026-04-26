// WHY: Pure-data registry split out from EvidenceKindIcon.tsx so unit tests
// can import the types / labels / color classes without pulling in JSX.
// Tests can then assert the 10-kind contract, labels, and color family
// assignments without a renderer. The .tsx file re-exports these.

export type EvidenceKind =
  | 'direct_quote'
  | 'structured_metadata'
  | 'byline_timestamp'
  | 'artifact_metadata'
  | 'visual_inspection'
  | 'lab_measurement'
  | 'comparative_rebadge'
  | 'inferred_reasoning'
  | 'absence_of_evidence'
  | 'identity_only';

export const EVIDENCE_KIND_VALUES: readonly EvidenceKind[] = Object.freeze([
  'direct_quote',
  'structured_metadata',
  'byline_timestamp',
  'artifact_metadata',
  'visual_inspection',
  'lab_measurement',
  'comparative_rebadge',
  'inferred_reasoning',
  'absence_of_evidence',
  'identity_only',
]);

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  direct_quote: 'Direct Quote',
  structured_metadata: 'Structured Metadata',
  byline_timestamp: 'Byline Timestamp',
  artifact_metadata: 'Artifact Metadata',
  visual_inspection: 'Visual Inspection',
  lab_measurement: 'Lab Measurement',
  comparative_rebadge: 'Comparative Rebadge',
  inferred_reasoning: 'Inferred Reasoning',
  absence_of_evidence: 'Absence of Evidence',
  identity_only: 'Identity Only',
};

// Color family per kind (matches the evidence-upgrade.html legend):
//   green = common / verbatim
//   teal = date-proxy
//   orange = OEM / artifact / rebadge
//   purple = photo
//   pink = lab
//   orange-soft = reasoning
//   red = weak / negative / identity-only
// WHY: Each evidence kind maps to a categorical chart-palette slot or a
// semantic state class. All themable via theme.css \u2014 no Tailwind drift.
export const EVIDENCE_KIND_COLOR_CLASS: Record<EvidenceKind, string> = {
  direct_quote:        'sf-status-text-success',
  structured_metadata: 'sf-status-text-success',
  byline_timestamp:    'sf-status-text-info',
  artifact_metadata:   'sf-status-text-warning',
  visual_inspection:   'sf-text-timeout',
  lab_measurement:     'text-[var(--sf-token-chart-1)]',
  comparative_rebadge: 'sf-status-text-warning',
  inferred_reasoning:  'sf-status-text-warning',
  absence_of_evidence: 'sf-status-text-danger',
  identity_only:       'sf-status-text-danger opacity-60',
};

// Only verbatim-quote kinds get the Copy-Quote affordance. For reasoning /
// byline / absence kinds the "evidence" string is a summary, not a quote
// to paste into ctrl-F, so a copy button would be misleading.
export const EVIDENCE_KIND_VERBATIM: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'direct_quote',
  'structured_metadata',
]);

export function evidenceKindLabel(kind: EvidenceKind | string | null | undefined): string {
  if (!kind || typeof kind !== 'string') return '';
  return EVIDENCE_KIND_LABELS[kind as EvidenceKind] || '';
}

export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === 'string' && value in EVIDENCE_KIND_LABELS;
}
