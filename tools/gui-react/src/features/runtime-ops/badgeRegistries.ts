// WHY: Single source of truth for all badge class + label mappings.
// Adding a new variant = 1 entry in the relevant registry. O(1) scaling.
// Pattern mirrors poolStageRegistry.ts.

// ── Multi-property registries (badge + label) ────────────────────────

interface MethodBadgeEntry { readonly badge: string; readonly label: string }

export const METHOD_BADGE_REGISTRY: Readonly<Record<string, MethodBadgeEntry>> = Object.freeze({
  html_spec_table:          { badge: 'sf-chip-info',    label: 'HTML Spec Table' },
  html_table:               { badge: 'sf-chip-info',    label: 'HTML Table' },
  embedded_json:            { badge: 'sf-chip-accent',  label: 'Embedded JSON' },
  json_ld:                  { badge: 'sf-chip-accent',  label: 'JSON-LD' },
  microdata:                { badge: 'sf-chip-accent',  label: 'Microdata' },
  opengraph:                { badge: 'sf-chip-accent',  label: 'OpenGraph' },
  main_article:             { badge: 'sf-chip-info',    label: 'Article Text' },
  dom:                      { badge: 'sf-chip-info',    label: 'DOM Selector' },
  pdf_text:                 { badge: 'sf-chip-warning', label: 'PDF Text' },
  pdf_kv:                   { badge: 'sf-chip-warning', label: 'PDF Key-Value' },
  pdf_table:                { badge: 'sf-chip-warning', label: 'PDF Table' },
  scanned_pdf_ocr:          { badge: 'sf-chip-danger',  label: 'Scanned PDF (OCR)' },
  scanned_pdf_ocr_table:    { badge: 'sf-chip-danger',  label: 'Scanned PDF Table (OCR)' },
  scanned_pdf_ocr_kv:       { badge: 'sf-chip-danger',  label: 'Scanned PDF KV (OCR)' },
  scanned_pdf_ocr_text:     { badge: 'sf-chip-danger',  label: 'Scanned PDF Text (OCR)' },
  image_ocr:                { badge: 'sf-chip-danger',  label: 'Image OCR' },
  chart_payload:            { badge: 'sf-chip-accent',  label: 'Chart Data' },
  network_json:             { badge: 'sf-chip-accent',  label: 'Network JSON' },
  llm_extract:              { badge: 'sf-chip-warning', label: 'LLM Extraction' },
  deterministic_normalizer: { badge: 'sf-chip-success', label: 'Normalizer' },
  consensus_policy_reducer: { badge: 'sf-chip-success', label: 'Consensus' },
});

const METHOD_FALLBACK: MethodBadgeEntry = Object.freeze({ badge: 'sf-chip-neutral', label: '' });

export function resolveMethodBadge(method: string): MethodBadgeEntry {
  return METHOD_BADGE_REGISTRY[method] ?? METHOD_FALLBACK;
}

// ──────────────────────────────────────────────────────────────────────

interface TierBadgeEntry { readonly badge: string; readonly label: string }

export const TIER_BADGE_REGISTRY: Readonly<Record<number, TierBadgeEntry>> = Object.freeze({
  1: { badge: 'sf-chip-success', label: 'T1 Official' },
  2: { badge: 'sf-chip-info',    label: 'T2 Lab Review' },
  3: { badge: 'sf-chip-warning', label: 'T3 Retail' },
  4: { badge: 'sf-chip-neutral', label: 'T4 Unverified' },
});

const TIER_BADGE_FALLBACK: TierBadgeEntry = Object.freeze({ badge: 'sf-chip-neutral', label: '-' });

export function resolveTierBadge(tier: number | null): TierBadgeEntry {
  if (tier === null || tier === undefined) return TIER_BADGE_FALLBACK;
  return TIER_BADGE_REGISTRY[tier] ?? TIER_BADGE_FALLBACK;
}

// ── Badge-only registries (string → chip class) ─────────────────────

export const STATUS_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  running:     'sf-chip-info',
  fetching:    'sf-chip-success',
  parsing:     'sf-chip-info',
  indexing:    'sf-chip-success',
  completed:   'sf-chip-success',
  fetched:     'sf-chip-success',
  parsed:      'sf-chip-success',
  indexed:     'sf-chip-success',
  idle:        'sf-chip-success',
  stuck:       'sf-chip-danger',
  fetch_error: 'sf-chip-danger',
  failed:      'sf-chip-danger',
  skipped:     'sf-chip-warning',
});

export function resolveStatusBadge(status: string): string {
  return STATUS_BADGE_MAP[status] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

// WHY: Worker states map directly to Crawlee's RequestState enum.
// Error sub-reasons (captcha, blocked, rate_limited) are metadata on worker.last_error,
// shown in the detail panel — not separate badge states.
export const WORKER_STATE_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  stuck:      'sf-chip-danger animate-pulse',
  running:    'sf-chip-info',
  crawling:   'sf-chip-info',
  crawled:    'sf-chip-success',
  failed:     'sf-chip-danger',
  retrying:   'sf-chip-info animate-pulse',
  skipped:    'sf-chip-neutral',
  queued:     'sf-chip-neutral opacity-50',
  idle:       'sf-chip-neutral',
});

export function resolveWorkerStateBadge(state: string): string {
  return WORKER_STATE_BADGE_MAP[state] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const FIELD_STATUS_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  accepted:  'sf-chip-success',
  conflict:  'sf-chip-danger',
  candidate: 'sf-chip-info',
  unknown:   'sf-chip-warning',
});

export function resolveFieldStatusBadge(status: string): string {
  return FIELD_STATUS_BADGE_MAP[status] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const FALLBACK_RESULT_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  succeeded: 'sf-chip-success',
  exhausted: 'sf-chip-danger',
  failed:    'sf-chip-danger',
  pending:   'sf-chip-info',
});

export function resolveFallbackResultBadge(result: string): string {
  return FALLBACK_RESULT_BADGE_MAP[result] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const FETCH_MODE_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  playwright: 'sf-chip-accent',
  crawlee:    'sf-chip-info',
  http:       'sf-chip-success',
});

export function resolveFetchModeBadge(mode: string): string {
  return FETCH_MODE_BADGE_MAP[mode] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const QUEUE_STATUS_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  queued:   'sf-chip-info',
  running:  'sf-chip-info animate-pulse',
  done:     'sf-chip-success',
  failed:   'sf-chip-danger',
  cooldown: 'sf-chip-warning',
});

export function resolveQueueStatusBadge(status: string): string {
  return QUEUE_STATUS_BADGE_MAP[status] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const LLM_CALL_STATUS_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  finished: 'sf-chip-success',
  failed:   'sf-chip-danger',
  running:  'sf-chip-info animate-pulse',
});

export function resolveLlmCallStatusBadge(status: string): string {
  return LLM_CALL_STATUS_BADGE_MAP[status] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const SERP_SELECTOR_DECISION_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  keep:      'sf-chip-success',
  hard_drop: 'sf-chip-warning',
  drop:      'sf-chip-danger',
  skip:      'sf-chip-danger',
  fetch:     'sf-chip-info',
});

export function resolveSerpSelectorDecisionBadge(decision: string): string {
  return SERP_SELECTOR_DECISION_BADGE_MAP[decision] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────
// WHY: Superset of helpers.ts domainRoleBadgeClass + SerpSelector
// roleBadgeClass. Includes spec_database, community, forum from the panel.

export const DOMAIN_ROLE_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  manufacturer:  'sf-chip-success',
  lab_review:    'sf-chip-info',
  review:        'sf-chip-info',
  retail:        'sf-chip-warning',
  database:      'sf-chip-accent',
  spec_database: 'sf-chip-accent',
  community:     'sf-chip-neutral',
  forum:         'sf-chip-neutral',
});

export function resolveDomainRoleBadge(role: string): string {
  return DOMAIN_ROLE_BADGE_MAP[role] ?? 'sf-chip-neutral';
}

// ──────────────────────────────────────────────────────────────────────

export const SAFETY_CLASS_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  safe:    'sf-chip-success',
  caution: 'sf-chip-warning',
  blocked: 'sf-chip-danger',
  unsafe:  'sf-chip-danger',
});

export function resolveSafetyClassBadge(safetyClass: string): string {
  return SAFETY_CLASS_BADGE_MAP[safetyClass] ?? 'sf-chip-neutral';
}

// ══════════════════════════════════════════════════════════════════════
// Prefetch panel registries (Finding 2)
// ══════════════════════════════════════════════════════════════════════

// ── Needset state (merges stateBadge + stateDotCls) ──────────────────

interface NeedsetStateEntry { readonly label: string; readonly badge: string; readonly dot: string }

export const NEEDSET_STATE_REGISTRY: Readonly<Record<string, NeedsetStateEntry>> = Object.freeze({
  missing:   { label: 'missing',   badge: 'sf-chip-danger',  dot: 'bg-[var(--sf-state-error-fg)]' },
  weak:      { label: 'weak',      badge: 'sf-chip-warning', dot: 'bg-[var(--sf-state-warning-fg)]' },
  conflict:  { label: 'conflict',  badge: 'sf-chip-danger',  dot: 'bg-[var(--sf-state-error-fg)]' },
  satisfied: { label: 'satisfied', badge: 'sf-chip-success', dot: 'bg-[var(--sf-state-success-fg)]' },
  covered:   { label: 'satisfied', badge: 'sf-chip-success', dot: 'bg-[var(--sf-state-success-fg)]' },
});

export function resolveNeedsetState(state: string): NeedsetStateEntry {
  return NEEDSET_STATE_REGISTRY[state] ?? { label: state || 'unknown', badge: 'sf-chip-neutral', dot: 'sf-bg-surface-soft-strong' };
}

// ── Needset priority bucket ──────────────────────────────────────────

interface NeedsetBucketEntry { readonly label: string; readonly badge: string }

export const NEEDSET_BUCKET_REGISTRY: Readonly<Record<string, NeedsetBucketEntry>> = Object.freeze({
  core:      { label: 'core',      badge: 'sf-chip-danger' },
  secondary: { label: 'secondary', badge: 'sf-chip-warning' },
  expected:  { label: 'expected',  badge: 'sf-chip-info' },
  optional:  { label: 'optional',  badge: 'sf-chip-neutral' },
});

export function resolveNeedsetBucket(bucket: string): NeedsetBucketEntry {
  return NEEDSET_BUCKET_REGISTRY[bucket] ?? { label: bucket || 'unknown', badge: 'sf-chip-neutral' };
}

// ── Identity classification ──────────────────────────────────────────

export const IDENTITY_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  exact:       'sf-chip-success',
  family:      'sf-chip-info',
  variant:     'sf-chip-warning',
  multi_model: 'sf-chip-danger',
  off_target:  'sf-chip-danger',
});

export function resolveIdentityBadge(identity: string): string {
  return IDENTITY_BADGE_MAP[identity] ?? 'sf-chip-neutral';
}

// ── Blocker type ─────────────────────────────────────────────────────
// WHY: blocker cards use chip classes because state-fg tokens are too
// light for standalone text on white — chip classes pair fg + bg for
// guaranteed contrast across all themes.

export const BLOCKER_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  missing:           'sf-chip-neutral',
  weak:              'sf-chip-warning',
  weak_evidence:     'sf-chip-warning',
  conflict:          'sf-chip-danger',
});

export function resolveBlockerBadge(key: string): string {
  return BLOCKER_BADGE_MAP[key] ?? 'sf-chip-neutral';
}

// ── Brand resolution (from PrefetchBrandResolverPanel) ──────────────

export const BRAND_RESOLUTION_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  resolved:       'sf-chip-success',
  resolved_empty: 'sf-chip-warning',
  failed:         'sf-chip-danger',
  skipped:        'sf-chip-warning',
});

export function resolveBrandResolutionBadge(status: string): string {
  return BRAND_RESOLUTION_BADGE_MAP[status] ?? 'sf-chip-neutral';
}

export const SKIP_REASON_LABEL_MAP: Readonly<Record<string, string>> = Object.freeze({
  no_brand_in_identity_lock: 'No brand name was found in the product identity lock.',
  no_api_key_for_triage_role: 'No API key is configured for the triage LLM role.',
});

export function resolveSkipReasonLabel(reason: string): string {
  return SKIP_REASON_LABEL_MAP[reason] ?? reason;
}

export function resolveConfidenceRingClass(confidence: number | null): string {
  if (confidence == null) return 'sf-metric-ring-muted';
  if (confidence >= 0.8) return 'sf-metric-ring-success';
  if (confidence >= 0.5) return 'sf-metric-ring-warning';
  return 'sf-metric-ring-danger';
}

export function resolveConfidenceTextClass(confidence: number | null): string {
  if (confidence == null) return 'sf-text-muted';
  if (confidence >= 0.8) return 'text-[var(--sf-state-success-fg)]';
  if (confidence >= 0.5) return 'text-[var(--sf-state-warning-fg)]';
  return 'text-[var(--sf-state-error-fg)]';
}

// ── Approval / gate badges (from SerpSelectorPanel, SearchProfilePanel) ─

export const APPROVAL_BADGE_MAP: Readonly<Record<string, string>> = Object.freeze({
  approved:  'sf-chip-success',
  candidate: 'sf-chip-neutral',
  reject:    'sf-chip-danger',
});

export function resolveApprovalBadge(bucket: string): string {
  return APPROVAL_BADGE_MAP[bucket] ?? 'sf-chip-neutral';
}

export function resolveGateBadge(active: boolean): string {
  return active ? 'sf-chip-success' : 'sf-chip-neutral';
}

// ── LLM reason badges (from PrefetchSearchPlannerPanel) ─────────────

export function resolveLlmReasonBadge(reason: string): string {
  const normalized = String(reason || '').trim().toLowerCase();
  if (normalized.startsWith('discovery_planner')) return 'sf-chip-info';
  return 'sf-chip-neutral';
}
