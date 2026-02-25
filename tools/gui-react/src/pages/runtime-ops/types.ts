export type RuntimeOpsTab = 'overview' | 'workers' | 'documents' | 'extraction' | 'fallbacks' | 'queue';

export interface RuntimeOpsSummaryResponse {
  run_id: string;
  status: string;
  round: number;
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
  state: 'idle' | 'running' | 'stuck';
  stage: 'search' | 'fetch' | 'parse' | 'index' | 'llm';
  current_url: string;
  started_at: string;
  elapsed_ms: number;
  last_error: string | null;
  retries: number;
  fetch_mode: string | null;
  docs_processed: number;
  fields_extracted: number;
}

export type WorkerDataTab = 'documents' | 'extraction' | 'queue' | 'screenshots' | 'metrics';

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

export interface WorkerDetailResponse {
  run_id: string;
  worker_id: string;
  documents: RuntimeOpsDocumentRow[];
  extraction_fields: WorkerExtractionField[];
  queue_jobs: QueueJobRow[];
  screenshots: WorkerScreenshot[];
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
  | 'url_predictor'
  | 'serp_triage'
  | 'domain_classifier'
  | 'search_results';

export interface PrefetchNeedSetNeed {
  field_key: string;
  field?: string;
  required_level: string;
  required?: string;
  required_weight: number;
  status: string;
  value: string;
  need_score: number;
  confidence: number;
  effective_confidence: number;
  pass_target: number;
  meets_pass_target: boolean;
  refs_found: number;
  min_refs: number;
  best_tier_seen: number | null;
  tier_preference: number[];
  identity_state: string;
  best_identity_match: number;
  blocked_by: string[];
  quarantined: boolean;
  conflict: boolean;
  reasons: string[];
  reason_payload: {
    why_missing: string | null;
    why_low_conf: string | null;
    why_blocked: string | null;
  };
  unknown_reason?: string;
}

export interface PrefetchNeedSetSnapshot {
  needset_size: number;
  total_fields: number;
  identity_status: string;
  identity_confidence: number;
  ts: string;
}

export interface PrefetchNeedSetData {
  needset_size: number;
  total_fields: number;
  identity_lock_state: { status: string; confidence: number };
  needs: PrefetchNeedSetNeed[];
  reason_counts: Record<string, number>;
  required_level_counts: Record<string, number>;
  snapshots: PrefetchNeedSetSnapshot[];
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
}

export interface SearchResultDetail {
  query: string;
  provider: string;
  dedupe_count: number;
  results: SerpResultRow[];
}

// ── URL Predictor Story Mode ──

export interface UrlPrediction {
  url: string;
  domain: string;
  predicted_payoff: number;
  target_fields: string[];
  risk_flags: string[];
  decision: string;
}

export interface UrlPredictionsData {
  remaining_budget: number;
  predictions: UrlPrediction[];
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

// ── Live Settings (from /api/v1/runtime-settings) ──

export interface PrefetchLiveSettings {
  profile?: string;
  phase2LlmEnabled: boolean;
  phase3LlmTriageEnabled: boolean;
  searchProvider: string;
  discoveryEnabled: boolean;
  dynamicCrawleeEnabled: boolean;
  scannedPdfOcrEnabled: boolean;
  maxPagesPerDomain?: number;
  discoveryResultsPerQuery?: number;
  discoveryMaxDiscovered?: number;
  serpTriageMaxUrls?: number;
  uberMaxUrlsPerDomain?: number;
}

// ── Pre-Fetch Phases Response ──

export interface PreFetchPhasesResponse {
  run_id: string;
  needset: PrefetchNeedSetData;
  search_profile: PrefetchSearchProfileData;
  llm_calls: {
    brand_resolver: PrefetchLlmCall[];
    search_planner: PrefetchLlmCall[];
    url_predictor: PrefetchLlmCall[];
    serp_triage: PrefetchLlmCall[];
    domain_classifier: PrefetchLlmCall[];
  };
  search_results: PrefetchSearchResult[];
  brand_resolution: BrandResolutionData | null;
  search_plans: SearchPlanPass[];
  search_result_details: SearchResultDetail[];
  url_predictions: UrlPredictionsData | null;
  serp_triage: SerpTriageResult[];
  domain_health: DomainHealthRow[];
}
