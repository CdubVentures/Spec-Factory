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
export const EVIDENCE_KIND_COLOR_CLASS: Record<EvidenceKind, string> = {
  direct_quote: 'text-emerald-600 dark:text-emerald-400',
  structured_metadata: 'text-emerald-600 dark:text-emerald-400',
  byline_timestamp: 'text-teal-600 dark:text-teal-400',
  artifact_metadata: 'text-amber-600 dark:text-amber-400',
  visual_inspection: 'text-purple-600 dark:text-purple-400',
  lab_measurement: 'text-pink-600 dark:text-pink-400',
  comparative_rebadge: 'text-amber-600 dark:text-amber-400',
  inferred_reasoning: 'text-orange-500 dark:text-orange-400',
  absence_of_evidence: 'text-red-600 dark:text-red-400',
  identity_only: 'text-red-600 dark:text-red-400 opacity-60',
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
