import type { IndexLabEvent } from './state/indexlabStore.ts';

export interface IndexLabRunSummary {
  run_id: string;
  category: string;
  product_id: string;
  status: string;
  started_at: string;
  ended_at: string;
  storage_origin?: 'local' | 's3';
  storage_state?: 'live' | 'stored';
  picker_label?: string;
  has_needset?: boolean;
  has_search_profile?: boolean;
  identity_fingerprint?: string;
  identity_lock_status?: string;
  dedupe_mode?: string;
  phase_cursor?: string;
  startup_ms?: {
    first_event?: number | null;
    search_started?: number | null;
    fetch_started?: number | null;
    parse_started?: number | null;
    index_started?: number | null;
  };
}

export interface IndexLabRunsResponse {
  root: string;
  runs: IndexLabRunSummary[];
}

export interface IndexLabRunEventsResponse {
  run_id: string;
  count: number;
  events: IndexLabEvent[];
}

export interface IndexLabNeedSetPlannerRow {
  field_key: string;
  required_level: string;
  priority_bucket: string;
  state: string;
  bundle_id: string;
}

/* ── Search plan bundle field ─────────────────────────────────────── */

export interface NeedSetBundleField {
  key: string;
  state: 'satisfied' | 'missing' | 'weak' | 'conflict';
  bucket: 'core' | 'secondary' | 'expected' | 'optional';
}

/* ── Search plan bundle (replaces legacy IndexLabNeedSetBundle) ───── */

export interface NeedSetPlannerBundle {
  key: string;
  label: string;
  desc: string;
  priority: 'core' | 'secondary' | 'optional';
  phase: 'now' | 'next' | 'hold';
  source_target: string;
  content_target: string;
  search_intent: string | null;
  host_class: string | null;
  query_family_mix: string | null;
  reason_active: string | null;
  queries: Array<{ q: string; family: string }>;
  fields: NeedSetBundleField[];
}

export interface IndexLabNeedSetSummary {
  total?: number;
  resolved?: number;
  core_total?: number;
  core_unresolved: number;
  secondary_total?: number;
  secondary_unresolved: number;
  optional_total?: number;
  optional_unresolved: number;
  conflicts: number;
  bundles_planned?: number;
}

export interface IndexLabNeedSetIdentity {
  state: string;
  source_label_state: string;
  manufacturer?: string | null;
  model?: string | null;
  confidence: number;
  official_domain?: string | null;
  support_domain?: string | null;
}

export interface IndexLabNeedSetFieldIdx {
  min_evidence_refs: number;
  query_terms?: string[];
  domain_hints?: string[];
  preferred_content_types?: string[];
  tooltip_md?: string | null;
  aliases?: string[];
}

export interface IndexLabNeedSetFieldHistory {
  existing_queries: string[];
  domains_tried: string[];
  host_classes_tried: string[];
  evidence_classes_tried: string[];
  query_count: number;
  urls_examined_count: number;
  no_value_attempts: number;
  duplicate_attempts_suppressed: number;
}

export interface IndexLabNeedSetField {
  field_key: string;
  label: string;
  group_key?: string | null;
  required_level: string;
  idx: IndexLabNeedSetFieldIdx;
  state: string;
  value: unknown;
  confidence: number;
  effective_confidence: number;
  refs_found: number;
  min_refs: number;
  best_tier_seen: number | null;
  pass_target: number;
  meets_pass_target: boolean;
  exact_match_required: boolean;
  need_score: number;
  reasons: string[];
  history: IndexLabNeedSetFieldHistory;
}

export interface IndexLabNeedSetPlannerSeed {
  missing_critical_fields: string[];
  unresolved_fields: string[];
  existing_queries: string[];
  current_product_identity: {
    category: string;
    brand: string;
    model: string;
  };
}

export interface IndexLabNeedSetDebug {
  suppressed_duplicate_rows: string[];
  state_inputs: Record<string, unknown>;
  bundle_assignment_notes: string[];
}

export interface IndexLabNeedSetBlockers {
  missing: number;
  weak: number;
  conflict: number;
  needs_exact_match: number;
  search_exhausted: number;
}

export interface IndexLabNeedSetDelta {
  field: string;
  from: string;
  to: string;
}

/* ── Search plan profile influence ──────────────────────────────── */

export interface NeedSetProfileInfluence {
  manufacturer_html: number;
  manual_pdf: number;
  support_docs: number;
  review_lookup: number;
  benchmark_lookup: number;
  fallback_web: number;
  targeted_single: number;
  duplicates_suppressed: number;
  focused_bundles: number;
  targeted_exceptions: number;
  total_queries: number;
  trusted_host_share: number;
  docs_manual_share: number;
}

export interface IndexLabNeedSetResponse {
  run_id: string;
  category?: string;
  product_id?: string;
  generated_at?: string;
  total_fields?: number;
  schema_version?: string;
  round?: number;
  identity?: IndexLabNeedSetIdentity;
  summary?: IndexLabNeedSetSummary;
  blockers?: IndexLabNeedSetBlockers;
  bundles?: NeedSetPlannerBundle[];
  profile_influence?: NeedSetProfileInfluence;
  deltas?: IndexLabNeedSetDelta[];
  rows?: IndexLabNeedSetPlannerRow[];
  debug?: Record<string, unknown>;
}

export interface EffectiveHostGroupEntry {
  host: string;
  origin: string;
  tier: string;
  searchable: boolean;
  health_action: 'normal' | 'downranked' | 'excluded';
}

export interface ScoreBreakdownV2 {
  base_score: number;
  frontier_penalty: number;
  identity_bonus: number;
  variant_guard_penalty: number;
  multi_model_penalty: number;
  tier_bonus: number;
  host_health_penalty: number;
  operator_risk_penalty: number;
  field_affinity_bonus: number;
  diversity_penalty: number;
  needset_coverage_bonus: number;
  tier_source: 'host_policy' | 'legacy';
}

export interface IndexLabSearchProfileAlias {
  alias: string;
  source?: string;
  weight?: number;
}

export interface IndexLabSearchProfileQueryRow {
  query: string;
  hint_source?: string;
  target_fields?: string[];
  doc_hint?: string;
  alias?: string;
  domain_hint?: string;
  result_count?: number;
  attempts?: number;
  providers?: string[];
}

export interface IndexLabSearchProfileResponse {
  run_id: string;
  category?: string;
  product_id?: string;
  generated_at?: string;
  status?: string;
  focus_fields?: string[];
  identity_aliases?: IndexLabSearchProfileAlias[];
  query_rows?: IndexLabSearchProfileQueryRow[];
  selected_queries?: string[];
  selected_query_count?: number;
  query_stats?: Array<{
    query: string;
    attempts: number;
    result_count: number;
    providers?: string[];
  }>;
  variant_guard_terms?: string[];
  alias_reject_log?: Array<{
    alias?: string;
    source?: string;
    reason?: string;
    stage?: string;
    detail?: string;
  }>;
  query_reject_log?: Array<{
    query?: string;
    source?: string | string[];
    reason?: string;
    stage?: string;
    detail?: string;
  }>;
  query_guard?: {
    brand_tokens?: string[];
    model_tokens?: string[];
    required_digit_groups?: string[];
    accepted_query_count?: number;
    rejected_query_count?: number;
  };
  field_target_queries?: Record<string, string[]>;
  doc_hint_queries?: Array<{
    doc_hint: string;
    queries: string[];
  }>;
  hint_source_counts?: Record<string, number>;
  key?: string;
  run_key?: string;
  latest_key?: string;
  provider?: string;
  llm_query_planning?: boolean;
  llm_query_model?: string;
  llm_queries?: Array<{ query?: string; target_fields?: string[] }>;
  llm_serp_selector?: boolean;
  llm_serp_selector_model?: string;
  discovered_count?: number;
  approved_count?: number;
  candidate_count?: number;
  source?: string;
  serp_explorer?: IndexLabSerpExplorerResponse;
}

export interface IndexLabSerpCandidateRow {
  url: string;
  title?: string;
  snippet?: string;
  host?: string;
  tier?: number | null;
  tier_name?: string;
  doc_kind?: string;
  triage_score?: number;
  decision?: string;
  reason_codes?: string[];
  providers?: string[];
  score_breakdown?: ScoreBreakdownV2;
  core_deep_classification?: 'core_fact' | 'deep_claim';
}

export interface IndexLabSerpSelectedUrlRow {
  url: string;
  query?: string;
  doc_kind?: string;
  tier_name?: string;
  score?: number;
  reason_codes?: string[];
}

export interface IndexLabSerpQueryRow {
  query: string;
  hint_source?: string;
  target_fields?: string[];
  doc_hint?: string;
  domain_hint?: string;
  result_count?: number;
  attempts?: number;
  providers?: string[];
  candidate_count?: number;
  selected_count?: number;
  candidates?: IndexLabSerpCandidateRow[];
}

export interface IndexLabSerpExplorerResponse {
  run_id?: string;
  generated_at?: string;
  provider?: string;
  llm_triage_enabled?: boolean;
  llm_triage_applied?: boolean;
  llm_triage_model?: string;
  query_count?: number;
  candidates_checked?: number;
  urls_triaged?: number;
  urls_selected?: number;
  urls_rejected?: number;
  dedupe_input?: number;
  dedupe_output?: number;
  duplicates_removed?: number;
  summary_only?: boolean;
  selected_urls?: IndexLabSerpSelectedUrlRow[];
  queries?: IndexLabSerpQueryRow[];
}

export interface SearxngStatusResponse {
  container_name: string;
  compose_path: string;
  compose_file_exists: boolean;
  base_url: string;
  docker_available: boolean;
  container_found: boolean;
  running: boolean;
  status: string;
  ports: string;
  http_ready: boolean;
  http_status: number;
  can_start: boolean;
  needs_start: boolean;
  message: string;
  docker_error?: string;
  http_error?: string;
}

export interface IndexingLlmConfigResponse {
  generated_at?: string;
  phase2?: {
    enabled_default?: boolean;
    model_default?: string;
  };
  phase3?: {
    enabled_default?: boolean;
    model_default?: string;
  };
  model_defaults?: {
    plan?: string;
    fast?: string;
    triage?: string;
    reasoning?: string;
    extract?: string;
    validate?: string;
    write?: string;
  };
  token_defaults?: {
    plan?: number;
    fast?: number;
    triage?: number;
    reasoning?: number;
    extract?: number;
    validate?: number;
    write?: number;
  };
  fallback_defaults?: {
    enabled?: boolean;
    plan?: string;
    extract?: string;
    validate?: string;
    write?: string;
    plan_tokens?: number;
    extract_tokens?: number;
    validate_tokens?: number;
    write_tokens?: number;
  };
  routing_snapshot?: Record<string, {
    primary?: {
      provider?: string | null;
      base_url?: string | null;
      model?: string | null;
      api_key_present?: boolean;
    } | null;
    fallback?: {
      provider?: string | null;
      base_url?: string | null;
      model?: string | null;
      api_key_present?: boolean;
    } | null;
  }>;
  model_options?: string[];
  token_presets?: number[];
  model_token_profiles?: Array<{
    model: string;
    default_output_tokens?: number;
    max_output_tokens?: number;
  }>;
  pricing_defaults?: {
    input_per_1m?: number;
    output_per_1m?: number;
    cached_input_per_1m?: number;
  };
  model_pricing?: Array<{
    model: string;
    provider?: string;
    input_per_1m?: number;
    output_per_1m?: number;
    cached_input_per_1m?: number;
  }>;
  knob_defaults?: Partial<Record<string, {
    model?: string;
    token_cap?: number;
  }>>;
  phase_schemas?: Record<string, { system_prompt: string; response_schema: Record<string, unknown> } | null>;
  pricing_meta?: {
    as_of?: string | null;
    sources?: Record<string, string>;
  };
  resolved_api_keys?: Record<string, string>;
}

export interface IndexingLlmMetricsRunRow {
  session_id: string;
  run_id?: string | null;
  is_session_fallback?: boolean;
  started_at?: string | null;
  last_call_at?: string | null;
  category?: string | null;
  product_id?: string | null;
  calls?: number;
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  providers?: string[];
  models?: string[];
  reasons?: string[];
}

export interface IndexingLlmMetricsResponse {
  generated_at?: string;
  period_days?: number;
  period?: string;
  total_calls?: number;
  total_cost_usd?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  avg_cost_per_product?: number;
  by_model?: Array<{
    provider?: string;
    model?: string;
    calls?: number;
    cost_usd?: number;
    avg_cost_per_call?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    products?: number;
  }>;
  by_run?: IndexingLlmMetricsRunRow[];
  budget?: {
    monthly_usd?: number;
    period_budget_usd?: number;
    exceeded?: boolean;
  };
}

export interface IndexingDomainChecklistUrlRow {
  url: string;
  checked_count?: number;
  selected_count?: number;
  fetch_started_count?: number;
  processed_count?: number;
  fetched_ok?: boolean;
  indexed?: boolean;
  err_404_count?: number;
  blocked_count?: number;
  parse_fail_count?: number;
  last_outcome?: string | null;
  last_status?: number | null;
  last_event?: string | null;
  last_ts?: string | null;
}

export interface IndexingDomainChecklistRow {
  domain: string;
  site_kind: string;
  candidates_checked?: number;
  urls_selected?: number;
  pages_fetched_ok?: number;
  pages_indexed?: number;
  dedupe_hits?: number;
  err_404?: number;
  repeat_404_urls?: number;
  blocked_count?: number;
  repeat_blocked_urls?: number;
  parse_fail_count?: number;
  avg_fetch_ms?: number;
  p95_fetch_ms?: number;
  evidence_hits?: number;
  evidence_used?: number;
  fields_covered?: number;
  status?: string;
  host_budget_score?: number;
  host_budget_state?: string;
  cooldown_seconds_remaining?: number;
  outcome_counts?: Partial<Record<string, number>>;
  last_success_at?: string | null;
  next_retry_at?: string | null;
  url_count?: number;
  urls?: IndexingDomainChecklistUrlRow[];
}

export interface IndexingDomainChecklistRepairRow {
  ts?: string | null;
  domain: string;
  query: string;
  status?: number;
  reason?: string | null;
  source_url?: string | null;
  cooldown_until?: string | null;
  doc_hint?: string | null;
  field_targets?: string[];
}

export interface IndexingDomainChecklistBadPatternRow {
  domain: string;
  path: string;
  reason?: string;
  count?: number;
  last_ts?: string;
}

export interface IndexingDomainChecklistResponse {
  command?: string;
  action?: string;
  category?: string | null;
  productId?: string | null;
  runId?: string | null;
  generated_at?: string;
  rows?: IndexingDomainChecklistRow[];
  domain_field_yield?: Array<{
    domain: string;
    field: string;
    evidence_used_count: number;
  }>;
  repair_queries?: IndexingDomainChecklistRepairRow[];
  bad_url_patterns?: IndexingDomainChecklistBadPatternRow[];
  notes?: string[];
}

// WHY: Automation queue types are auto-generated from backend shape descriptors.
// Source: src/features/indexing/api/contracts/automationQueueContract.js
// Codegen: tools/gui-react/scripts/generateAutomationQueueTypes.js
import type { AutomationJobRowGen, AutomationActionRowGen, AutomationSummaryGen } from './types.generated';

export type IndexLabAutomationJobRow = AutomationJobRowGen;
export type IndexLabAutomationActionRow = AutomationActionRowGen;

export interface IndexLabAutomationQueueResponse {
  generated_at?: string;
  run_id?: string;
  category?: string;
  product_id?: string;
  summary?: AutomationSummaryGen;
  policies?: {
    owner?: string;
    loops?: Record<string, boolean>;
  };
  jobs?: IndexLabAutomationJobRow[];
  actions?: IndexLabAutomationActionRow[];
}

export interface IndexLabEvidenceIndexDocumentRow {
  source_id: string;
  source_url: string;
  source_host?: string;
  source_tier?: number | null;
  crawl_status?: string;
  http_status?: number | null;
  fetched_at?: string | null;
  run_id?: string | null;
  artifact_count?: number;
  hash_count?: number;
  unique_hashes?: number;
  assertion_count?: number;
  evidence_ref_count?: number;
}

export interface IndexLabEvidenceIndexFieldRow {
  field_key: string;
  assertions?: number;
  evidence_refs?: number;
  distinct_sources?: number;
}

export interface IndexLabEvidenceIndexSearchRow {
  source_id: string;
  source_url?: string;
  source_host?: string;
  source_tier?: number | null;
  run_id?: string | null;
  field_key?: string;
  context_kind?: string;
  assertion_id?: string;
  snippet_id?: string | null;
  evidence_url?: string | null;
  quote_preview?: string;
  snippet_preview?: string;
  value_preview?: string;
}

export interface IndexLabEvidenceIndexResponse {
  generated_at?: string;
  run_id?: string;
  category?: string;
  product_id?: string;
  db_ready?: boolean;
  scope?: {
    mode?: string;
    run_match?: boolean;
    run_id?: string;
  };
  summary?: {
    documents?: number;
    artifacts?: number;
    artifacts_with_hash?: number;
    unique_hashes?: number;
    assertions?: number;
    evidence_refs?: number;
    fields_covered?: number;
  };
  documents?: IndexLabEvidenceIndexDocumentRow[];
  top_fields?: IndexLabEvidenceIndexFieldRow[];
  search?: {
    query?: string;
    limit?: number;
    count?: number;
    rows?: IndexLabEvidenceIndexSearchRow[];
    note?: string;
  };
  dedupe_stream?: {
    total?: number;
    new_count?: number;
    reused_count?: number;
    updated_count?: number;
    total_chunks_indexed?: number;
  };
}

export interface IndexLabPhase07HitRow {
  rank?: number;
  score?: number;
  url?: string;
  host?: string;
  source_key?: string;
  tier?: number | null;
  tier_name?: string | null;
  doc_kind?: string;
  method?: string;
  key_path?: string | null;
  snippet_id?: string;
  snippet_hash?: string | null;
  source_id?: string | null;
  quote_preview?: string;
  retrieved_at?: string | null;
  evidence_refs?: string[];
  reason_badges?: string[];
  ranking_features?: {
    tier_weight?: number;
    doc_kind_weight?: number;
    method_weight?: number;
    anchor_matches?: string[];
    identity_matches?: string[];
    unit_match?: boolean;
    direct_field_match?: boolean;
    total_score?: number;
  };
}

export interface IndexLabPhase07FieldRow {
  field_key: string;
  required_level?: string;
  need_score?: number;
  min_refs_required?: number;
  distinct_sources_required?: boolean;
  refs_selected?: number;
  distinct_sources_selected?: number;
  min_refs_satisfied?: boolean;
  hits_count?: number;
  tier_preference?: number[];
  anchors?: string[];
  unit_hint?: string | null;
  parse_template_hint?: string | null;
  component_hint?: string | null;
  doc_hints?: string[];
  retrieval_query?: string;
  hits?: IndexLabPhase07HitRow[];
  prime_sources?: IndexLabPhase07HitRow[];
}

export interface IndexLabPhase07Response {
  run_id?: string;
  category?: string;
  product_id?: string;
  generated_at?: string;
  summary_only?: boolean;
  summary?: {
    fields_attempted?: number;
    fields_with_hits?: number;
    fields_satisfied_min_refs?: number;
    fields_unsatisfied_min_refs?: number;
    refs_selected_total?: number;
    distinct_sources_selected?: number;
    avg_hits_per_field?: number;
    evidence_pool_size?: number;
  };
  fields?: IndexLabPhase07FieldRow[];
}

export interface IndexLabPhase08BatchRow {
  batch_id?: string;
  status?: string;
  route_reason?: string;
  model?: string;
  source_host?: string | null;
  source_url?: string | null;
  target_field_count?: number;
  snippet_count?: number;
  reference_count?: number;
  raw_candidate_count?: number;
  accepted_candidate_count?: number;
  dropped_missing_refs?: number;
  dropped_invalid_refs?: number;
  dropped_evidence_verifier?: number;
  min_refs_satisfied_count?: number;
  min_refs_total?: number;
  elapsed_ms?: number;
  error?: string;
}

export interface IndexLabPhase08FieldContextRow {
  field_key?: string;
  required_level?: string;
  difficulty?: string;
  ai_mode?: string;
  parse_template_intent?: {
    template_id?: string | null;
  };
  evidence_policy?: {
    required?: boolean;
    min_evidence_refs?: number;
    distinct_sources_required?: boolean;
    tier_preference?: number[];
  };
}

export interface IndexLabPhase08PrimeRow {
  field_key?: string;
  snippet_id?: string;
  source_id?: string | null;
  url?: string;
  quote_preview?: string;
}

export interface IndexLabPhase08Response {
  run_id?: string;
  category?: string;
  product_id?: string;
  generated_at?: string;
  summary_only?: boolean;
  summary?: {
    batch_count?: number;
    batch_error_count?: number;
    schema_fail_rate?: number;
    raw_candidate_count?: number;
    accepted_candidate_count?: number;
    dangling_snippet_ref_count?: number;
    dangling_snippet_ref_rate?: number;
    evidence_policy_violation_count?: number;
    evidence_policy_violation_rate?: number;
    min_refs_satisfied_count?: number;
    min_refs_total?: number;
    min_refs_satisfied_rate?: number;
    validator_context_field_count?: number;
    validator_prime_source_rows?: number;
  };
  batches?: IndexLabPhase08BatchRow[];
  field_contexts?: Record<string, IndexLabPhase08FieldContextRow>;
  prime_sources?: {
    rows?: IndexLabPhase08PrimeRow[];
  };
}

export interface IndexLabDynamicFetchDashboardHostRow {
  host?: string;
  request_count?: number;
  success_count?: number;
  failure_count?: number;
  status_2xx_count?: number;
  status_4xx_count?: number;
  status_5xx_count?: number;
  parse_error_count?: number;
  screenshot_count?: number;
  network_payload_rows_total?: number;
  graphql_replay_rows_total?: number;
  fetcher_kind_counts?: Record<string, number>;
  attempts_total?: number;
  retry_count_total?: number;
  avg_attempts_per_request?: number;
  avg_retry_per_request?: number;
  avg_fetch_ms?: number;
  avg_parse_ms?: number;
  avg_host_wait_ms?: number;
  avg_navigation_ms?: number;
  avg_network_idle_wait_ms?: number;
  avg_interactive_wait_ms?: number;
  avg_graphql_replay_ms?: number;
  avg_content_capture_ms?: number;
  avg_screenshot_capture_ms?: number;
}

export interface IndexLabDynamicFetchDashboardResponse {
  run_id?: string;
  category?: string;
  product_id?: string;
  generated_at?: string | null;
  host_count?: number;
  hosts?: IndexLabDynamicFetchDashboardHostRow[];
  summary_only?: boolean;
  key?: string | null;
  latest_key?: string | null;
}

export interface RoundSummaryRow {
  round: number;
  needset_size: number;
  missing_required_count: number;
  critical_count: number;
  confidence: number;
  validated: boolean;
  improved: boolean;
  improvement_reasons: string[];
}

export interface RoundSummaryResponse {
  run_id?: string;
  rounds: RoundSummaryRow[];
  stop_reason: string | null;
  round_count: number;
}

export type PanelKey = 'picker';
export type PanelStateToken = 'live' | 'ready' | 'waiting';

export const PANEL_KEYS: PanelKey[] = ['picker'];

export const DEFAULT_PANEL_COLLAPSED: Record<PanelKey, boolean> = {
  picker: false,
};

export interface TimedIndexLabEvent {
  row: IndexLabEvent;
  tsMs: number;
  stage: string;
  event: string;
  productId: string;
}

/* ── Product Run History ─────────────────────────────────────────── */

export interface RunFunnelSummary {
  queries_executed: number;
  results_found: number;
  candidates_unique: number;
  llm_kept: number;
  llm_dropped: number;
  urls_selected: number;
  urls_ok: number;
  urls_blocked: number;
  urls_error: number;
  docs_parsed: number;
  domains_total: number;
  domains_safe: number;
  domains_caution: number;
}

export interface DomainBreakdownRow {
  domain: string;
  role: string;
  safety: string;
  urls: number;
  ok: number;
  errors: number;
  avg_size: number;
}

export interface FetchErrorRow {
  url: string;
  host: string;
  error_type: string;
  http_status: number;
  response_ms: number;
  domain_role: string;
  domain_safety: string;
}

export interface ExtractionPluginSummary {
  urls: number;
  artifacts: number;
  total_bytes: number;
}

export interface ExtractionSummary {
  plugins: Record<string, ExtractionPluginSummary>;
  total_artifacts: number;
  total_bytes: number;
  urls_parsed: number;
  total_candidates: number;
  structured_data_found: number;
  articles_extracted: number;
  low_quality_articles: number;
}

export interface ProductHistoryRunRow {
  run_id: string;
  status: string;
  cost_usd: number;
  started_at: string;
  ended_at: string;
  funnel: RunFunnelSummary;
  domains: DomainBreakdownRow[];
  errors: FetchErrorRow[];
  extraction: ExtractionSummary;
}

export interface ProductHistoryQueryRow {
  query: string;
  provider: string;
  result_count: number;
  run_id: string;
  ts: string;
}

export interface ProductHistoryUrlRow {
  url: string;
  host: string;
  http_status: number;
  source_tier: number;
  doc_kind: string;
  content_type: string;
  size_bytes: number;
  run_id: string;
  crawled_at: string;
}

export interface ProductHistoryAggregate {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  total_cost_usd: number;
  avg_cost_per_run: number;
  avg_duration_ms: number;
  total_queries: number;
  total_urls: number;
  urls_success: number;
  urls_failed: number;
  unique_hosts: number;
}

export interface ProductHistoryResponse {
  product_id: string;
  category: string;
  aggregate: ProductHistoryAggregate;
  runs: ProductHistoryRunRow[];
  queries: ProductHistoryQueryRow[];
  urls: ProductHistoryUrlRow[];
}
