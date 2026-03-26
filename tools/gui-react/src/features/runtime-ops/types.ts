// ── Imports from generated backend shape descriptors ──

import type {
  RuntimeOpsSummary,
  RuntimeOpsBlocker,
  RuntimeOpsDocumentRow,
  RuntimeOpsDocumentDetail,
  PoolMetric,
  QualityMetric,
  FailureMetric,
  ExtractionCandidate,
  ExtractionFieldRow,
  FallbackEventRow,
  HostFallbackProfile,
  LaneSummary,
  BlockedHostEntry,
  PipelineStage,
  PipelineTransition,
  LlmCallRow,
  SearchPlanEnhancementRow,
  TriageScoreComponents,
  SerpTriageFunnel,
  DomainHealthRow,
  PrefetchSearchResult,
  BrandResolutionData,
  QueryJourneyData,
  QueueJobRowGen,
  RuntimeOpsWorkerRowGen,
  PrefetchLlmCallGen,
  LlmCallsDashboardSummaryGen,
  TriageCandidateGen,
  SearchPlanPassBase,
  SerpTriageEnvelope,
  SerpSearchResultDetail,
} from './types.generated.ts';

// ── Pure re-exports (identical to generated) ──

export type {
  RuntimeOpsSummary,
  RuntimeOpsBlocker,
  RuntimeOpsDocumentRow,
  RuntimeOpsDocumentDetail,
  PoolMetric,
  QualityMetric,
  FailureMetric,
  ExtractionCandidate,
  ExtractionFieldRow,
  FallbackEventRow,
  HostFallbackProfile,
  LaneSummary,
  BlockedHostEntry,
  PipelineStage,
  PipelineTransition,
  LlmCallRow,
  SearchPlanEnhancementRow,
  TriageScoreComponents,
  SerpTriageFunnel,
  DomainHealthRow,
  PrefetchSearchResult,
  BrandResolutionData,
  QueryJourneyData,
};

// ── UI-only tab / badge types ──

export type RuntimeOpsTab = 'overview' | 'workers' | 'documents' | 'fallbacks' | 'queue' | 'compound';

export type RuntimeIdxBadgeState = 'active' | 'off';

export interface RuntimeIdxBadge {
  field_path: string;
  label: string;
  state: RuntimeIdxBadgeState;
  tooltip: string;
}

// ── Extended interfaces (narrow or add fields over generated base) ──

export interface RuntimeOpsSummaryResponse extends RuntimeOpsSummary {
  run_id: string;
}

export interface RuntimeOpsDocumentDetailResponse extends RuntimeOpsDocumentDetail {
  run_id: string;
  timeline: RuntimeOpsTimelineEntry[];
}

export interface QueueJobRow extends QueueJobRowGen {
  transitions: { from_status: string; to_status: string; ts: string; reason: string }[];
}

export interface RuntimeOpsWorkerRow extends RuntimeOpsWorkerRowGen {
  idx_runtime?: RuntimeIdxBadge[];
}

export interface PrefetchLlmCall extends PrefetchLlmCallGen {
  tokens: { input: number; output: number };
}

export interface LlmCallsDashboardSummary extends LlmCallsDashboardSummaryGen {
  by_model: Array<{ model: string; calls: number; cost_usd: number }>;
  by_call_type: Array<{ call_type: string; cost_usd: number }>;
}

export interface TriageCandidate extends TriageCandidateGen {
  score_components: TriageScoreComponents;
}

export interface SearchPlanPass extends SearchPlanPassBase {
  queries_generated: string[];
  query_target_map: Record<string, string[]>;
  missing_critical_fields: string[];
  source?: string;
  enhancement_rows?: SearchPlanEnhancementRow[];
}

export interface SerpTriageResult extends SerpTriageEnvelope {
  funnel?: SerpTriageFunnel | null;
  candidates: TriageCandidate[];
}

export interface SearchResultDetail extends SerpSearchResultDetail {
  results: SerpResultRow[];
  screenshot_filename?: string;
}

// ── Full definitions (can't use extends — many fields change from required to optional) ──

// WHY: Can't use extends PrefetchNeedSetBase — many fields change from required to optional.
export interface PrefetchNeedSetData {
  total_fields: number;
  identity_state?: string | null;
  summary?: PrefetchNeedSetSummary;
  blockers?: { missing: number; weak: number; conflict: number; needs_exact_match?: number; search_exhausted?: number };
  focus_fields?: string[];
  fields?: NeedSetField[];
  bundles?: PrefetchSearchPlanBundle[];
  profile_mix?: PrefetchNeedSetProfileMix;
  profile_influence?: PrefetchNeedSetProfileInfluence | null;
  tier_allocation?: PrefetchNeedSetTierAllocation | null;
  rows?: PrefetchNeedSetPlannerRow[];
  deltas?: Array<{ field: string; from: string; to: string }>;
  round?: number;
  schema_version?: string | null;
  snapshots?: Array<{ needset_size: number; total_fields: number; identity_state: string | null; ts: string }>;
  debug?: {
    suppressed_duplicate_rows: string[];
    state_inputs: Record<string, unknown>;
    bundle_assignment_notes: string[];
  };
  needset_size?: number;
}

// WHY: Can't use extends PrefetchSearchProfileBase — many fields change from required to optional.
export interface PrefetchSearchProfileData {
  query_count: number;
  selected_query_count?: number;
  provider: string;
  llm_query_planning: boolean;
  llm_query_model?: string;
  llm_queries?: Array<{ query?: string; target_fields?: string[] }>;
  identity_aliases: Array<string | PrefetchSearchProfileAlias>;
  variant_guard_terms: string[];
  focus_fields?: string[];
  query_rows: PrefetchSearchProfileQueryRow[];
  query_guard: Record<string, number>;
  hint_source_counts?: Record<string, number>;
  field_rule_gate_counts?: Record<string, PrefetchFieldRuleGateCount>;
  field_rule_hint_counts_by_field?: Record<string, PrefetchFieldRuleHintCountsByField>;
  generated_at?: string;
  product_id?: string;
  source?: string;
  query_reject_log?: Array<{ query?: string; source?: string; reason: string; stage?: string; detail?: string }>;
  alias_reject_log?: Array<{ alias?: string; source?: string; reason?: string; stage?: string }>;
  brand_resolution?: {
    officialDomain: string;
    supportDomain: string;
    aliases: string[];
    confidence: number;
    reasoning: string[];
  } | null;
  base_model?: string;
  aliases?: string[];
  discovered_count?: number;
  approved_count?: number;
  candidate_count?: number;
  selected_count?: number;
  llm_serp_selector?: boolean;
  serp_explorer?: {
    query_count: number;
    candidates_checked: number;
    candidates_sent?: number;
    urls_triaged: number;
    urls_selected: number;
    urls_rejected: number;
    dedupe_input: number;
    dedupe_output: number;
    duplicates_removed: number;
    hard_drop_count?: number;
    soft_exclude_count?: number;
    llm_triage_applied: boolean;
  } | null;
}

// ── UI-only response / wrapper types ──

export interface RuntimeOpsWorkersResponse {
  run_id: string;
  workers: RuntimeOpsWorkerRow[];
}

export interface RuntimeOpsDocumentsResponse {
  run_id: string;
  documents: RuntimeOpsDocumentRow[];
}

export interface RuntimeOpsTimelineEntry {
  event: string;
  ts: string;
  stage: string;
  status: string;
  status_code?: number;
  duration_ms?: number | null;
  parse_method?: string | null;
  evidence_chunks?: number | null;
}

export interface RuntimeOpsMetricsRailData {
  pool_metrics: Record<string, PoolMetric>;
  quality_metrics: {
    identity_status: string;
    acceptance_rate: number;
    mean_confidence: number;
  };
  failure_metrics: {
    total_fetches: number;
    fallback_count: number;
    fallback_rate: number;
    blocked_hosts: number;
    retry_total: number;
    no_progress_streak: number;
  };
}

export interface RuntimeOpsMetricsResponse extends RuntimeOpsMetricsRailData {
  run_id: string;
}

export interface ProcessStatusResponse {
  running: boolean;
}

// ── Extraction Tab ──

export interface ExtractionFieldsResponse {
  run_id: string;
  fields: ExtractionFieldRow[];
}

// ── Fallbacks Tab ──

export interface FallbacksResponse {
  run_id: string;
  events: FallbackEventRow[];
  host_profiles: HostFallbackProfile[];
}


export interface QueueStateResponse {
  run_id: string;
  jobs: QueueJobRow[];
  lane_summary: LaneSummary[];
  blocked_hosts: BlockedHostEntry[];
}

// ── Worker Dashboard (Phase 13.3) ──

export type WorkerDataTab = 'extraction' | 'screenshots';

export interface WorkerExtractionField {
  field: string;
  value: string | null;
  confidence: number;
  method: string;
  source_url: string;
}

export interface WorkerScreenshot {
  filename: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  ts: string;
}

export interface RuntimeOpsWorkerLastFrame {
  run_id: string;
  worker_id: string;
  data: string;
  width: number;
  height: number;
  ts: string;
  mime_type?: string;
  synthetic?: boolean;
}

export interface RuntimeOpsWorkerLastFrameResponse {
  run_id: string;
  worker_id: string;
  frame: RuntimeOpsWorkerLastFrame | null;
}

export interface SearchResultScoreComponents {
  base_relevance: number;
  tier_boost: number;
  identity_match: number;
  penalties: number;
}

export interface SearchResultEntry {
  url: string;
  domain: string;
  title: string;
  rank: number;
  provider: string;
  fetch_worker_id: string | null;
  fetched: boolean;
  fetch_link_type?: 'exact' | 'host_fallback' | 'none';
  decision: 'keep' | 'maybe' | 'drop' | 'unknown';
  score: number;
  rationale: string;
  score_components: SearchResultScoreComponents | null;
}

export interface SearchWorkerAttempt {
  attempt_no: number;
  attempt_type: 'primary' | 'fallback';
  attempt_type_label: string;
  query: string;
  provider: string;
  resolved_provider: string | null;
  status: 'running' | 'done' | 'zero';
  result_count: number;
  duration_ms: number;
  started_ts: string | null;
  finished_ts: string | null;
  results: SearchResultEntry[];
}

export interface WorkerLlmDetail {
  call_type: string | null;
  round: number | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_cost: number | null;
  duration_ms: number | null;
  input_summary: string | null;
  output_summary: string | null;
  prefetch_tab: string | null;
  prompt_preview: string | null;
  response_preview: string | null;
}

export interface ExtractionPluginEvent {
  plugin: string;
  status: 'completed' | 'failed';
  url?: string;
  reason?: string;
}

export interface WorkerDetailResponse {
  run_id: string;
  worker_id: string;
  documents: RuntimeOpsDocumentRow[];
  extraction_fields: WorkerExtractionField[];
  extraction_plugins?: ExtractionPluginEvent[];
  indexed_field_names?: string[];
  queue_jobs: QueueJobRow[];
  screenshots: WorkerScreenshot[];
  search_history?: SearchWorkerAttempt[];
  llm_detail?: WorkerLlmDetail;
  phase_lineage?: Record<string, unknown>;
}

export interface PipelineFlowResponse {
  run_id: string;
  stages: PipelineStage[];
  recent_transitions: PipelineTransition[];
}

// ── Fetch Phases (Workers tab fetch row) ──

export interface FetchPluginRecord {
  worker_id: string;
  display_label: string;
  url: string;
  host: string;
  ts: string;
  [key: string]: unknown;
}

export interface FetchPluginData {
  records: FetchPluginRecord[];
  total: number;
}

// WHY: All fetch plugin phases use the generic FetchPluginData shape.
// The builder (runtimeOpsFetchBuilders.js) groups plugin_hook_completed events
// by plugin name and spreads result fields into FetchPluginRecord. Each panel
// casts to its own local interface (e.g. StealthRecord, AutoScrollRecord).
export interface FetchPhasesResponse {
  run_id: string;
  stealth?: FetchPluginData;
  cookie_consent?: FetchPluginData;
  auto_scroll?: FetchPluginData;
  dom_expansion?: FetchPluginData;
  css_override?: FetchPluginData;
}

// ── Extraction Phases ──

export interface ExtractionPluginEntry {
  url: string;
  worker_id: string;
}

export interface ExtractionPluginData {
  entries: ExtractionPluginEntry[];
  total: number;
}

export interface ExtractionPhasesResponse {
  run_id: string;
  plugins: Record<string, ExtractionPluginData>;
}

// ── Pre-Fetch Phases (Workers tab pinned row) ──

import type { PrefetchTabKey as _PrefetchTabKey } from './panels/prefetch/prefetchStageRegistry.ts';
export type PrefetchTabKey = _PrefetchTabKey;

export interface PrefetchNeedSetBundle {
  bundle_id: string;
  label: string;
  priority_bucket: string;
  fields: string[];
  states: Record<string, string>;
  source_target: string[];
  content_target: string[];
  query_terms: string[];
  domain_hints: string[];
  planned_query_families: string[];
}

export interface PrefetchNeedSetPlannerRow {
  field_key: string;
  priority_bucket: string;
  state: string;
  bundle_id: string;
}

export interface PrefetchNeedSetSummary {
  core_unresolved: number;
  secondary_unresolved: number;
  optional_unresolved: number;
  conflicts: number;
  bundles_planned: number;
}

export interface PrefetchNeedSetProfileMix {
  manufacturer_html: number;
  manual_pdf: number;
  support_docs: number;
  fallback_web: number;
  targeted_single_field: number;
}

/** Per-field history from buildFieldHistories — tracks anti-garbage signals across rounds */
export interface NeedSetFieldHistory {
  existing_queries: string[];
  domains_tried: string[];
  host_classes_tried: string[];
  evidence_classes_tried: string[];
  query_count: number;
  urls_examined_count: number;
  no_value_attempts: number;
  duplicate_attempts_suppressed: number;
  refs_found?: number;
}

/** NeedSet assessment field entry from computeNeedSet (includes per-field history) */
export interface NeedSetField {
  field_key: string;
  state: string;
  required_level?: string;
  group_key?: string;
  history?: NeedSetFieldHistory;
}

/** Search plan bundle field entry */
export interface PrefetchNeedSetBundleField {
  key: string;
  state: 'satisfied' | 'missing' | 'weak' | 'conflict';
  bucket: 'core' | 'secondary' | 'expected' | 'optional';
}

/** Search plan bundle shape (from searchPlanBuilder) */
export interface PrefetchSearchPlanBundle {
  key: string;
  label: string;
  desc: string;
  priority: 'core' | 'secondary' | 'optional';
  phase: 'now' | 'next' | 'hold';
  source_target: string;
  content_target: string;
  search_intent?: string | null;
  host_class?: string | null;
  query_family_mix?: string | null;
  reason_active: string | null;
  fields: PrefetchNeedSetBundleField[];
}

/** Tier-aware profile influence — budget-aware when tier_allocation is present */
export interface PrefetchNeedSetProfileInfluence {
  targeted_brand: number;
  targeted_specification: number;
  targeted_sources: number;
  total_sources: number;
  targeted_groups: number;
  total_groups: number;
  targeted_single: number;
  total_unresolved_keys: number;
  groups_now: number;
  groups_next: number;
  groups_hold: number;
  planner_confidence: number;
  budget: number | null;
  allocated: number | null;
  overflow_groups: number;
  overflow_keys: number;
}

export interface TierAllocationSeed {
  type: 'brand' | 'specs' | 'source';
  source_name: string | null;
  is_needed: boolean;
}

export interface TierAllocationGroup {
  group_key: string;
  productivity_score: number;
  allocated: boolean;
}

export interface TierAllocationKeyBucket {
  group_key: string;
  key_count: number;
  allocated_count: number;
}

export interface PrefetchNeedSetTierAllocation {
  budget: number;
  tier1_seed_count: number;
  tier2_group_count: number;
  tier3_key_count: number;
  tier1_seeds: TierAllocationSeed[];
  tier2_groups: TierAllocationGroup[];
  tier3_keys: TierAllocationKeyBucket[];
  overflow_group_count: number;
  overflow_key_count: number;
}

export interface PrefetchSearchProfileQueryRow {
  query: string;
  target_fields?: string[];
  result_count?: number;
  attempts?: number;
  providers?: string[];
  hint_source?: string;
  doc_hint?: string;
  domain_hint?: string;
  source_host?: string;
  __from_plan_profile?: boolean;
  // Tier metadata from NeedSet → Search Profile tier builders
  tier?: string;
  group_key?: string;
  normalized_key?: string;
  repeat_count?: number;
  all_aliases?: string[];
  domain_hints?: string[];
  preferred_content_types?: string[];
  domains_tried_for_key?: string[];
  content_types_tried_for_key?: string[];
}

export interface PrefetchSearchProfileAlias {
  alias?: string;
  source?: string;
  weight?: number;
}

export interface PrefetchFieldRuleGateCount {
  value_count?: number;
  total_value_count?: number;
  effective_value_count?: number;
  enabled_field_count?: number;
  disabled_field_count?: number;
  status?: string;
}

export interface PrefetchFieldRuleHintCount {
  value_count?: number;
  total_value_count?: number;
  effective_value_count?: number;
  status?: string;
}

export interface PrefetchFieldRuleHintCountsByField {
  query_terms?: PrefetchFieldRuleHintCount;
  domain_hints?: PrefetchFieldRuleHintCount;
  preferred_content_types?: PrefetchFieldRuleHintCount;
}

// ── Search Results Story Mode ──

export interface SerpResultRow {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  rank: number;
  relevance_score: number;
  decision: string;
  reason: string;
  provider?: string;
  already_crawled?: boolean;
}

// ── LLM Calls Dashboard ─────────────────────────────────────────────────────

export interface LlmCallsDashboardResponse {
  run_id?: string;
  calls: LlmCallRow[];
  summary: LlmCallsDashboardSummary;
}

// ── Live Settings (from /api/v1/runtime-settings) ──

export interface PrefetchLiveSettings {
  profile?: string;
  searchEngines?: string;
  discoveryEnabled?: boolean;
  maxPagesPerDomain?: number;
  discoveryResultsPerQuery?: number;
}

// ── Pre-Fetch Phases Response ──

export interface PreFetchPhasesResponse {
  run_id: string;
  needset: PrefetchNeedSetData;
  search_profile: PrefetchSearchProfileData;
  llm_calls: {
    brand_resolver: PrefetchLlmCall[];
    needset_planner: PrefetchLlmCall[];
    search_planner: PrefetchLlmCall[];
    serp_selector: PrefetchLlmCall[];
    domain_classifier: PrefetchLlmCall[];
  };
  search_results: PrefetchSearchResult[];
  brand_resolution: BrandResolutionData | null;
  search_plans: SearchPlanPass[];
  query_journey?: {
    selected_query_count: number;
    selected_queries: string[];
    search_plan_query_count: number;
    llm_enhanced_count?: number;
    deterministic_query_count: number;
    rejected_count: number;
  } | null;
  search_result_details: SearchResultDetail[];
  cross_query_url_counts?: Record<string, number>;
  serp_selector: SerpTriageResult[];
  domain_health: DomainHealthRow[];
  phase_cursor?: string;
  idx_runtime?: Partial<Record<PrefetchTabKey, RuntimeIdxBadge[]>>;
}

// ── Compound Learning Dashboard (Phase 4C) ──

export type CompoundVerdict = 'PROVEN' | 'PARTIAL' | 'NOT_PROVEN';
export type UrlReuseTrend = 'increasing' | 'flat' | 'decreasing';

export interface CompoundCurveRun {
  run_id: string;
  searches: number;
  url_reuse_pct: number;
  new_urls: number;
  fill_rate_pct: number;
}

export interface CompoundCurveResponse {
  category: string;
  verdict: CompoundVerdict;
  search_reduction_pct: number;
  url_reuse_trend: UrlReuseTrend;
  runs: CompoundCurveRun[];
}

export interface QueryTopYieldEntry {
  query: string;
  provider: string;
  avg_yield: number;
}

export interface QueryProviderBreakdown {
  query_count: number;
  total_results: number;
  avg_field_yield: number;
}

export interface QuerySummaryResponse {
  category: string;
  total: number;
  dead_count: number;
  top_yield: QueryTopYieldEntry[];
  provider_breakdown: Record<string, QueryProviderBreakdown>;
}

export interface UrlHighYieldEntry {
  url: string;
  times_visited: number;
  fields_filled: string[];
}

export interface UrlTierBreakdown {
  url_count: number;
  total_fields: number;
  avg_success_rate: number;
}

export interface UrlSummaryResponse {
  category: string;
  total: number;
  reuse_distribution: Record<string, number>;
  high_yield: UrlHighYieldEntry[];
  tier_breakdown: Record<string, UrlTierBreakdown>;
}

export type HostHealthStatus = 'healthy' | 'cooldown' | 'degraded' | 'blocked';

export interface HostHealthRow {
  host: string;
  total: number;
  failed: number;
  block_rate: number;
  status: HostHealthStatus;
  avg_fields_per_fetch: number;
}

export interface HostHealthResponse {
  category: string;
  hosts: HostHealthRow[];
}

export interface PlanDiffFieldSide {
  value: string | null;
  host: string | null;
  tier: number | null;
  confidence: number;
  found: boolean;
}

export type PlanDiffWinner = 'run1' | 'run2' | 'tie' | 'neither';

export interface PlanDiffFieldRow {
  field: string;
  run1: PlanDiffFieldSide;
  run2: PlanDiffFieldSide;
  winner: PlanDiffWinner;
  reason: string;
}

export interface PlanDiffResponse {
  run1_id: string;
  run2_id: string;
  fields: PlanDiffFieldRow[];
  run1_wins: number;
  run2_wins: number;
  ties: number;
  neither: number;
}

export interface CrossRunSparklineData {
  fill_rate: number[];
  searches: number[];
  block_rate: number[];
}

export interface CrossRunMetricsResponse {
  category: string;
  run_count: number;
  field_fill_rate: number;
  searches_per_product: number;
  block_rate_by_host: Record<string, number>;
  sparkline_data: CrossRunSparklineData;
}

export interface KnobSnapshotEntry {
  knob: string;
  config_value: string;
  default_value: string;
  effective_value: string;
  match: boolean;
}

export interface KnobSnapshot {
  ts: string;
  entries: KnobSnapshotEntry[];
  mismatch_count: number;
  total_knobs: number;
}

export interface KnobSnapshotsResponse {
  category: string;
  snapshots: KnobSnapshot[];
}

export type CompoundSubTab = 'curve' | 'queries' | 'urls' | 'plan-diff' | 'knobs';
