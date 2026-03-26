// AUTO-GENERATED from backend shape descriptors — do not edit manually.
// Run: node tools/gui-react/scripts/generateRuntimeOpsTypes.js
//
// Shape descriptors live in:
//   src/features/indexing/api/contracts/runtimeOpsContract.js
//   src/features/indexing/api/contracts/runtimeOpsPrefetchContract.js
//   src/features/indexing/api/contracts/prefetchContract.js

export interface RuntimeOpsSummary {
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

export interface RuntimeOpsDocumentDetail {
  url: string;
  host: string;
  timeline: unknown[];
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

export interface QualityMetric {
  identity_status: string;
  acceptance_rate: number;
  mean_confidence: number;
}

export interface FailureMetric {
  total_fetches: number;
  fallback_count: number;
  fallback_rate: number;
  blocked_hosts: number;
  retry_total: number;
  no_progress_streak: number;
}

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

export interface QueueJobRowGen {
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
  transitions: unknown[];
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

export interface ExtractionCandidate {
  value: string;
  method: string;
  confidence: number;
  source_host: string;
  source_tier: number;
  snippet_id: string | null;
  quote: string | null;
}

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
  is_fallback?: boolean;
  is_lab?: boolean;
  primary_duration_ms?: number | null;
  ts: string;
}

export interface LlmCallsDashboardSummaryGen {
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
  by_model: unknown[];
  by_call_type: unknown[];
}

export interface SerpSearchResultEntry {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  rank: number;
  relevance_score: number;
  decision: string;
  reason: string;
  provider: string;
  already_crawled: boolean;
}

export interface SerpSearchResultDetail {
  query: string;
  provider: string;
  dedupe_count: number;
}

export interface TriageScoreComponents {
  base_relevance: number;
  tier_boost: number;
  identity_match: number;
  penalties: number;
}

export interface TriageCandidateGen {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  score: number;
  decision: string;
  rationale: string;
  role: string;
  identity_prelim: string;
  host_trust_class: string;
  triage_disposition: string;
  doc_kind_guess: string;
  approval_bucket: string;
}

export interface SerpTriageEnvelope {
  query: string;
  kept_count: number;
  dropped_count: number;
}

export interface SerpTriageFunnel {
  raw_input: number;
  hard_drop_count: number;
  candidates_after_hard_drop: number;
  canon_merge_count: number;
  candidates_classified: number;
  candidates_sent_to_llm: number;
  overflow_capped: number;
  llm_model: string;
  llm_applied: boolean;
}

export interface PrefetchSearchProfileBase {
  query_count: number;
  selected_query_count: number;
  provider: string;
  llm_query_planning: boolean;
  llm_query_model: string;
  llm_queries: unknown[];
  identity_aliases: unknown[];
  variant_guard_terms: unknown[];
  focus_fields: unknown[];
  query_rows: unknown[];
  query_guard: Record<string, unknown>;
  hint_source_counts: Record<string, unknown>;
  field_rule_gate_counts: Record<string, unknown>;
  field_rule_hint_counts_by_field: Record<string, unknown>;
  generated_at: string;
  product_id: string;
  source: string;
  query_reject_log: unknown[];
  alias_reject_log: unknown[];
  brand_resolution: Record<string, unknown> | null;
  base_model: string;
  aliases: unknown[];
  discovered_count: number;
  approved_count: number;
  candidate_count: number;
  llm_serp_selector: boolean;
  serp_explorer: Record<string, unknown> | null;
}

export interface SearchPlanEnhancementRow {
  query: string;
  hint_source: string;
  tier: string;
  target_fields: string[];
  doc_hint: string;
  alias: string;
  domain_hint: string;
  source_host: string;
  group_key: string;
  normalized_key: string;
  repeat_count: number;
  all_aliases: string[];
  domain_hints: string[];
  preferred_content_types: string[];
  domains_tried_for_key: string[];
  content_types_tried_for_key: string[];
  original_query: string;
}

export interface PrefetchNeedSetBase {
  needset_size: number;
  total_fields: number;
  identity_state: string | null;
  fields: unknown[];
  summary: Record<string, unknown>;
  blockers: Record<string, unknown>;
  bundles: unknown[];
  profile_influence: Record<string, unknown> | null;
  deltas: unknown[];
  rows: unknown[];
  round: number;
  schema_version: string | null;
  snapshots: unknown[];
}

export interface BrandResolutionData {
  brand: string;
  status?: string;
  skip_reason?: string;
  official_domain: string;
  aliases: string[];
  support_domain: string;
  confidence: number | null;
  candidates?: unknown[];
  reasoning?: string[];
}

export interface SearchPlanPassBase {
  pass_index: number;
  pass_name: string;
  queries_generated: unknown[];
  stop_condition: string;
  plan_rationale: string;
  query_target_map: Record<string, unknown>;
  missing_critical_fields: unknown[];
  mode: string;
}

export interface QueryJourneyData {
  selected_query_count: number;
  selected_queries: unknown[];
  search_plan_query_count: number;
  deterministic_query_count: number;
  rejected_count: number;
}

export interface PrefetchSearchResult {
  query: string;
  provider: string;
  result_count: number;
  duration_ms: number;
  worker_id: string;
  throttle_events?: number;
  throttle_wait_ms?: number;
  ts: string;
}

export interface DomainHealthRow {
  domain: string;
  role: string;
  safety_class: string;
  cooldown_remaining: number;
  success_rate: number;
  avg_latency_ms: number;
  fetch_count: number;
  blocked_count: number;
  timeout_count: number;
  last_blocked_ts: string | null;
  notes: string;
}

export interface PrefetchLlmCallGen {
  status: 'finished' | 'failed' | 'running';
  reason: string;
  model: string;
  provider: string;
  tokens: Record<string, unknown>;
  duration_ms: number;
  prompt_preview: string | null;
  response_preview: string | null;
  error: string | null;
}

// WHY: Worker row is base fields (required) + pool-specific extras (all optional).
// The pool determines which extra fields are populated.
export interface RuntimeOpsWorkerRowGen {
  worker_id: string;
  pool: string;
  state: 'idle' | 'running' | 'stuck' | 'queued' | 'blocked' | 'captcha' | 'retrying';
  stage: 'search' | 'fetch' | 'parse' | 'index' | 'llm';
  current_url: string;
  started_at: string;
  elapsed_ms: number;
  last_error: string | null;
  retries: number;
  fetch_mode: string | null;
  docs_processed: number;
  fields_extracted: number;
  assigned_search_slot?: string | null;
  assigned_search_attempt_no?: number | null;
  assigned_search_worker_id?: string | null;
  assigned_search_query?: string | null;
  display_label?: string | null;
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
  provider?: string | null;
  round?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  estimated_cost?: number | null;
  duration_ms?: number | null;
  input_summary?: string | null;
  output_summary?: string | null;
  prefetch_tab?: string | null;
  prompt_preview?: string | null;
  response_preview?: string | null;
  is_fallback?: boolean;
  is_lab?: boolean;
}
