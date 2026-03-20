export type RuntimeOpsTab = 'overview' | 'workers' | 'documents' | 'extraction' | 'fallbacks' | 'queue' | 'compound';

export interface RuntimeOpsSummaryResponse {
  run_id: string;
  status: string;
  round: number;
  phase_cursor?: string;
  boot_step?: string;
  boot_progress?: number;
  total_fetches: number;
  total_parses: number;
  total_llm_calls: number;
  error_rate: number;
  docs_per_min: number;
  fields_per_min: number;
  top_blockers: RuntimeOpsBlocker[];
}

export interface RuntimeOpsBlocker {
  host: string;
  error_count: number;
}

export interface RuntimeOpsWorkersResponse {
  run_id: string;
  workers: RuntimeOpsWorkerRow[];
}

export type RuntimeIdxBadgeState = 'active' | 'off';

export interface RuntimeIdxBadge {
  field_path: string;
  label: string;
  state: RuntimeIdxBadgeState;
  tooltip: string;
}

export interface RuntimeOpsDocumentRow {
  url: string;
  host: string;
  status: string;
  status_code: number | null;
  bytes: number | null;
  content_type: string | null;
  content_hash: string | null;
  dedupe_outcome: string | null;
  parse_method: string | null;
  last_event_ts: string;
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

export interface RuntimeOpsDocumentDetailResponse {
  run_id: string;
  url: string;
  host: string;
  timeline: RuntimeOpsTimelineEntry[];
  status_code: number | null;
  bytes: number | null;
  parse_method: string | null;
  candidates: number | null;
  evidence_chunks: number | null;
}

export interface PoolMetric {
  active: number;
  queued: number;
  completed: number;
  failed: number;
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

export interface ExtractionCandidate {
  value: string;
  method: string;
  confidence: number;
  source_host: string;
  source_tier: number;
  snippet_id: string | null;
  quote: string | null;
}

export interface ExtractionFieldRow {
  field: string;
  value: string | null;
  status: 'accepted' | 'conflict' | 'candidate' | 'unknown';
  confidence: number;
  method: string;
  source_tier: number | null;
  source_host: string;
  refs_count: number;
  batch_id: string | null;
  round: number;
  candidates: ExtractionCandidate[];
}

export interface ExtractionFieldsResponse {
  run_id: string;
  fields: ExtractionFieldRow[];
}

// ── Fallbacks Tab ──

export interface FallbackEventRow {
  url: string;
  host: string;
  from_mode: string;
  to_mode: string;
  reason: string;
  attempt: number;
  result: 'pending' | 'succeeded' | 'exhausted' | 'failed';
  elapsed_ms: number;
  ts: string;
}

export interface HostFallbackProfile {
  host: string;
  fallback_total: number;
  success_count: number;
  success_rate: number;
  exhaustion_count: number;
  blocked_count: number;
  modes_used: string[];
}

export interface FallbacksResponse {
  run_id: string;
  events: FallbackEventRow[];
  host_profiles: HostFallbackProfile[];
}

// ── Queue Tab ──

export interface QueueTransition {
  from_status: string;
  to_status: string;
  ts: string;
  reason: string;
}

export interface QueueJobRow {
  id: string;
  lane: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cooldown';
  host: string;
  url: string;
  query: string | null;
  reason: string;
  field_targets: string[];
  cooldown_until: string | null;
  created_at: string;
  transitions: QueueTransition[];
}

export interface LaneSummary {
  lane: string;
  queued: number;
  running: number;
  done: number;
  failed: number;
  cooldown: number;
}

export interface BlockedHostEntry {
  host: string;
  blocked_count: number;
  threshold: number;
  removed_count: number;
  ts: string;
}

export interface QueueStateResponse {
  run_id: string;
  jobs: QueueJobRow[];
  lane_summary: LaneSummary[];
  blocked_hosts: BlockedHostEntry[];
}

// ── Worker Dashboard (Phase 13.3) ──

export interface RuntimeOpsWorkerRow {
  worker_id: string;
  pool: string;
  state: 'idle' | 'running' | 'stuck' | 'queued';
  stage: 'search' | 'fetch' | 'parse' | 'index' | 'llm';
  current_url: string;
  started_at: string;
  elapsed_ms: number;
  last_error: string | null;
  retries: number;
  fetch_mode: string | null;
  docs_processed: number;
  fields_extracted: number;
  display_label?: string | null;
  assigned_search_slot?: string | null;
  assigned_search_attempt_no?: number | null;
  assigned_search_worker_id?: string | null;
  assigned_search_query?: string | null;
  slot?: string | null;
  tasks_started?: number;
  tasks_completed?: number;
  current_query?: string | null;
  current_provider?: string | null;
  zero_result_count?: number;
  avg_result_count?: number;
  avg_duration_ms?: number;
  last_result_count?: number;
  last_duration_ms?: number;
  primary_count?: number;
  fallback_count?: number;
  call_type?: string | null;
  model?: string | null;
  round?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  estimated_cost?: number | null;
  duration_ms?: number | null;
  input_summary?: string | null;
  output_summary?: string | null;
  prefetch_tab?: string | null;
  idx_runtime?: RuntimeIdxBadge[];
}

export type WorkerDataTab = 'documents' | 'extraction' | 'queue' | 'screenshots' | 'metrics' | 'pipeline';

export type DocDetailSubTab = 'info' | 'fields' | 'shots' | 'timeline';

export interface PhaseStats {
  phase_id: string;
  phase_label: string;
  doc_count: number;
  field_count: number;
  methods_used: string[];
  confidence_avg: number;
}

export interface WorkerPhaseLineage {
  phases: PhaseStats[];
}

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

export interface WorkerDetailResponse {
  run_id: string;
  worker_id: string;
  documents: RuntimeOpsDocumentRow[];
  extraction_fields: WorkerExtractionField[];
  indexed_field_names?: string[];
  queue_jobs: QueueJobRow[];
  screenshots: WorkerScreenshot[];
  search_history?: SearchWorkerAttempt[];
  llm_detail?: WorkerLlmDetail;
  phase_lineage?: WorkerPhaseLineage;
}

export interface PipelineStage {
  name: string;
  active: number;
  completed: number;
  failed: number;
}

export interface PipelineTransition {
  url: string;
  from_stage: string;
  to_stage: string;
  ts: string;
}

export interface PipelineFlowResponse {
  run_id: string;
  stages: PipelineStage[];
  recent_transitions: PipelineTransition[];
}

// ── Pre-Fetch Phases (Workers tab pinned row) ──

export type PrefetchTabKey =
  | 'needset'
  | 'search_profile'
  | 'brand_resolver'
  | 'search_planner'
  | 'query_journey'
  | 'serp_selector'
  | 'domain_classifier'
  | 'search_results';

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

/** Schema 2 field entry from computeNeedSet (includes per-field history) */
export interface NeedSetField {
  field_key: string;
  state: string;
  required_level?: string;
  group_key?: string;
  history?: NeedSetFieldHistory;
}

/** Schema 4 bundle field entry */
export interface PrefetchNeedSetBundleField {
  key: string;
  state: 'satisfied' | 'missing' | 'weak' | 'conflict';
  bucket: 'core' | 'secondary' | 'expected' | 'optional';
}

/** Schema 4 bundle shape (from searchPlanBuilder) */
export interface PrefetchSchema4Bundle {
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
  targeted_specification: number;
  targeted_sources: number;
  targeted_groups: number;
  targeted_single: number;
  groups_now: number;
  groups_next: number;
  groups_hold: number;
  total_unresolved_keys: number;
  planner_confidence: number;
  budget: number | null;
  allocated: number | null;
  overflow_groups: number;
  overflow_keys: number;
}

export interface TierAllocationSeed {
  type: 'specs' | 'source';
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

export interface PrefetchNeedSetData {
  total_fields: number;
  identity_state?: string | null;
  summary?: PrefetchNeedSetSummary;
  blockers?: { missing: number; weak: number; conflict: number; needs_exact_match?: number; search_exhausted?: number };
  focus_fields?: string[];
  fields?: NeedSetField[];
  bundles?: PrefetchSchema4Bundle[];
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
  effective_host_plan?: Record<string, unknown> | null;
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
  llm_serp_selector?: boolean;
  serp_explorer?: {
    query_count: number;
    candidates_checked: number;
    urls_triaged: number;
    urls_selected: number;
    urls_rejected: number;
    dedupe_input: number;
    dedupe_output: number;
    duplicates_removed: number;
    llm_triage_applied: boolean;
  } | null;
}

export interface PrefetchLlmCall {
  status: 'finished' | 'failed' | 'running';
  reason: string;
  model: string;
  provider: string;
  tokens: { input: number; output: number };
  duration_ms: number;
  prompt_preview: string | null;
  response_preview: string | null;
  error: string | null;
}

export interface PrefetchSearchResult {
  query: string;
  provider: string;
  result_count: number;
  duration_ms: number;
  worker_id: string;
  throttle_wait_ms?: number;
  throttle_events?: number;
  ts: string;
}

// ── Brand Resolver Story Mode ──

export interface BrandCandidate {
  name: string;
  confidence: number;
  evidence_snippets: string[];
  disambiguation_note: string;
}

export interface BrandResolutionData {
  brand: string;
  status?: string;
  skip_reason?: string;
  official_domain: string;
  aliases: string[];
  support_domain: string;
  confidence: number;
  candidates: BrandCandidate[];
  reasoning?: string[];
}

// ── Search Planner Story Mode ──

export interface SearchPlanPass {
  pass_index: number;
  pass_name: string;
  queries_generated: string[];
  query_target_map: Record<string, string[]>;
  missing_critical_fields: string[];
  mode: string;
  stop_condition: string;
  plan_rationale: string;
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

export interface SearchResultDetail {
  query: string;
  provider: string;
  dedupe_count: number;
  results: SerpResultRow[];
  screenshot_filename?: string;
}

// ── SERP Triage Story Mode ──

export interface TriageScoreComponents {
  base_relevance: number;
  tier_boost: number;
  identity_match: number;
  penalties: number;
}

export interface TriageCandidate {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  score: number;
  decision: string;
  rationale: string;
  score_components: TriageScoreComponents;
  role: string;
  identity_prelim: string;
  host_trust_class: string;
  primary_lane: number | null;
  triage_disposition: string;
  doc_kind_guess: string;
  approval_bucket: string;
}

export interface SerpTriageResult {
  query: string;
  kept_count: number;
  dropped_count: number;
  candidates: TriageCandidate[];
}

// ── Domain Health Story Mode ──

export interface DomainHealthRow {
  domain: string;
  role: string;
  safety_class: string;
  budget_score: number;
  cooldown_remaining: number;
  success_rate: number;
  avg_latency_ms: number;
  notes: string;
}

// ── LLM Calls Dashboard ─────────────────────────────────────────────────────

export interface LlmCallRow {
  index: number;
  worker_id: string;
  call_type: string;
  round: number;
  model: string;
  provider: string;
  status: 'active' | 'done' | 'failed';
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  estimated_usage?: boolean;
  duration_ms: number | null;
  prompt_preview: string | null;
  response_preview: string | null;
  prefetch_tab: string | null;
  ts: string;
}

export interface LlmCallsDashboardSummary {
  total_calls: number;
  active_calls: number;
  completed_calls: number;
  total_cost_usd: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_latency_ms: number;
  rounds: number;
  calls_in_latest_round: number;
  by_model: Array<{ model: string; calls: number; cost_usd: number }>;
  by_call_type: Array<{ call_type: string; cost_usd: number }>;
}

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
  dynamicCrawleeEnabled?: boolean;
  scannedPdfOcrEnabled?: boolean;
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
    schema4_query_count: number;
    deterministic_query_count: number;
    host_plan_query_count: number;
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
