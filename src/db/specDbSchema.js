/**
 * SpecDb schema DDL — CREATE TABLE / INDEX statements.
 * Extracted from specDb.js for readability; no logic, pure data.
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS component_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  component_type TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_maker TEXT DEFAULT '',
  component_identity_id INTEGER REFERENCES component_identity(id),
  property_key TEXT NOT NULL,
  value TEXT,
  confidence REAL DEFAULT 1.0,
  variance_policy TEXT,
  source TEXT DEFAULT 'component_db',
  accepted_candidate_id TEXT,
  needs_review INTEGER DEFAULT 0,
  overridden INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, component_type, component_name, component_maker, property_key)
);

CREATE TABLE IF NOT EXISTS component_identity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  component_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  maker TEXT DEFAULT '',
  links TEXT,
  source TEXT DEFAULT 'component_db',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, component_type, canonical_name, maker)
);

CREATE TABLE IF NOT EXISTS component_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL REFERENCES component_identity(id),
  alias TEXT NOT NULL,
  source TEXT DEFAULT 'component_db',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(component_id, alias)
);

CREATE TABLE IF NOT EXISTS enum_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  field_key TEXT NOT NULL,
  source TEXT DEFAULT 'field_rules',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, field_key)
);

CREATE TABLE IF NOT EXISTS list_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  list_id INTEGER NOT NULL REFERENCES enum_lists(id),
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT,
  source TEXT DEFAULT 'known_values',
  accepted_candidate_id TEXT,
  enum_policy TEXT,
  needs_review INTEGER DEFAULT 0,
  overridden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, field_key, value)
);

CREATE TABLE IF NOT EXISTS item_field_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT,
  confidence REAL DEFAULT 0,
  source TEXT DEFAULT 'pipeline',
  accepted_candidate_id TEXT,
  overridden INTEGER DEFAULT 0,
  needs_ai_review INTEGER DEFAULT 0,
  ai_review_complete INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  override_source TEXT,
  override_value TEXT,
  override_reason TEXT,
  override_provenance TEXT,
  overridden_by TEXT,
  overridden_at TEXT,
  UNIQUE(category, product_id, field_key)
);

CREATE TABLE IF NOT EXISTS product_review_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  review_status TEXT DEFAULT 'pending',
  review_started_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id)
);

CREATE TABLE IF NOT EXISTS item_component_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  component_type TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_maker TEXT DEFAULT '',
  match_type TEXT,
  match_score REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id, field_key)
);

CREATE TABLE IF NOT EXISTS item_list_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  list_value_id INTEGER REFERENCES list_values(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id, field_key, list_value_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_type_name ON component_values(component_type, component_name);
CREATE INDEX IF NOT EXISTS idx_ca_alias ON component_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_el_field ON enum_lists(category, field_key);
CREATE INDEX IF NOT EXISTS idx_lv_field ON list_values(field_key);
CREATE INDEX IF NOT EXISTS idx_ifs_product ON item_field_state(product_id);
CREATE INDEX IF NOT EXISTS idx_icl_product ON item_component_links(product_id);
CREATE INDEX IF NOT EXISTS idx_ill_product ON item_list_links(product_id);
CREATE INDEX IF NOT EXISTS idx_icl_component ON item_component_links(category, component_type, component_name, component_maker);
CREATE INDEX IF NOT EXISTS idx_ill_list_value ON item_list_links(list_value_id);

-- Phase 2 tables

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, product_id TEXT NOT NULL,
  brand TEXT DEFAULT '', model TEXT DEFAULT '', base_model TEXT DEFAULT '', variant TEXT DEFAULT '',
  status TEXT DEFAULT 'active', identifier TEXT, brand_identifier TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id)
);

CREATE TABLE IF NOT EXISTS product_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, product_id TEXT NOT NULL,
  s3key TEXT DEFAULT '', status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 3, attempts_total INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3,
  next_retry_at TEXT, last_run_id TEXT,
  cost_usd_total REAL DEFAULT 0, rounds_completed INTEGER DEFAULT 0,
  next_action_hint TEXT, last_urls_attempted TEXT,
  last_error TEXT, last_started_at TEXT, last_completed_at TEXT,
  dirty_flags TEXT, last_summary TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id)
);

CREATE TABLE IF NOT EXISTS curation_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id TEXT NOT NULL,
  category TEXT NOT NULL, suggestion_type TEXT NOT NULL,
  field_key TEXT, component_type TEXT,
  value TEXT NOT NULL, normalized_value TEXT,
  status TEXT DEFAULT 'pending',
  source TEXT, product_id TEXT, run_id TEXT,
  first_seen_at TEXT DEFAULT (datetime('now')), last_seen_at TEXT,
  reviewed_by TEXT, reviewed_at TEXT, review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, suggestion_type, field_key, value)
);

CREATE TABLE IF NOT EXISTS component_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT NOT NULL,
  category TEXT NOT NULL, component_type TEXT NOT NULL,
  field_key TEXT, raw_query TEXT, matched_component TEXT,
  match_type TEXT, name_score REAL, property_score REAL, combined_score REAL,
  alternatives TEXT, product_id TEXT, run_id TEXT,
  status TEXT DEFAULT 'pending_ai',
  ai_decision TEXT, ai_suggested_name TEXT, ai_suggested_maker TEXT, ai_reviewed_at TEXT,
  product_attributes TEXT, reasoning_note TEXT,
  human_reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(review_id)
);

CREATE TABLE IF NOT EXISTS product_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, product_id TEXT NOT NULL, run_id TEXT NOT NULL,
  is_latest INTEGER DEFAULT 1,
  summary_json TEXT, validated INTEGER DEFAULT 0, confidence REAL DEFAULT 0,
  cost_usd_run REAL DEFAULT 0, sources_attempted INTEGER DEFAULT 0,
  run_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id, run_id)
);

CREATE TABLE IF NOT EXISTS llm_route_matrix (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('field', 'component', 'list')),
  route_key TEXT NOT NULL,
  required_level TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  availability TEXT NOT NULL,
  effort INTEGER NOT NULL DEFAULT 3,
  effort_band TEXT NOT NULL DEFAULT '1-3',
  single_source_data INTEGER NOT NULL DEFAULT 1,
  all_source_data INTEGER NOT NULL DEFAULT 0,
  enable_websearch INTEGER NOT NULL DEFAULT 1,
  model_ladder_today TEXT NOT NULL,
  all_sources_confidence_repatch INTEGER NOT NULL DEFAULT 1,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  studio_key_navigation_sent_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_contract_rules_sent_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_extraction_guidance_sent_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_tooltip_or_description_sent_when_present INTEGER NOT NULL DEFAULT 1,
  studio_enum_options_sent_when_present INTEGER NOT NULL DEFAULT 1,
  studio_component_variance_constraints_sent_in_component_review INTEGER NOT NULL DEFAULT 1,
  studio_parse_template_sent_direct_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_ai_mode_difficulty_effort_sent_direct_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_required_level_sent_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_component_entity_set_sent_when_component_field INTEGER NOT NULL DEFAULT 1,
  studio_evidence_policy_sent_direct_in_extract_review INTEGER NOT NULL DEFAULT 1,
  studio_variance_policy_sent_in_component_review INTEGER NOT NULL DEFAULT 1,
  studio_constraints_sent_in_component_review INTEGER NOT NULL DEFAULT 1,
  studio_send_booleans_prompted_to_model INTEGER NOT NULL DEFAULT 0,
  scalar_linked_send TEXT NOT NULL DEFAULT 'scalar value + prime sources',
  component_values_send TEXT NOT NULL DEFAULT 'component values + prime sources',
  list_values_send TEXT NOT NULL DEFAULT 'list values prime sources',
  llm_output_min_evidence_refs_required INTEGER NOT NULL DEFAULT 1,
  insufficient_evidence_action TEXT NOT NULL DEFAULT 'threshold_unmet',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, route_key)
);

CREATE INDEX IF NOT EXISTS idx_pq_category ON product_queue(category, status);
CREATE INDEX IF NOT EXISTS idx_pq_product ON product_queue(category, product_id);
CREATE INDEX IF NOT EXISTS idx_cs_category ON curation_suggestions(category, suggestion_type, status);
CREATE INDEX IF NOT EXISTS idx_crq_category ON component_review_queue(category, component_type, status);

CREATE TABLE IF NOT EXISTS field_test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  scenario_id INTEGER,
  scenario_name TEXT,
  scenario_category TEXT,
  scenario_desc TEXT,
  run_id TEXT,
  confidence REAL,
  coverage REAL,
  completeness REAL,
  traffic_green INTEGER DEFAULT 0,
  traffic_yellow INTEGER DEFAULT 0,
  traffic_red INTEGER DEFAULT 0,
  constraint_conflicts INTEGER DEFAULT 0,
  missing_required TEXT,
  curation_suggestions INTEGER DEFAULT 0,
  runtime_failures INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  validation_json TEXT,
  repair_json TEXT,
  repair_total INTEGER DEFAULT 0,
  repair_repaired INTEGER DEFAULT 0,
  repair_failed INTEGER DEFAULT 0,
  repair_rerun INTEGER DEFAULT 0,
  repair_skipped INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id)
);
CREATE INDEX IF NOT EXISTS idx_ft_category ON field_test(category);
CREATE INDEX IF NOT EXISTS idx_pr_product ON product_runs(category, product_id);
CREATE INDEX IF NOT EXISTS idx_pr_latest ON product_runs(category, product_id, is_latest) WHERE is_latest = 1;
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category);
-- WHY: idx_lrm_cat_scope moved to SECONDARY_INDEXES (runs after migrations that add the scope column)


-- Key review tables (AI decisions, user overrides, contract snapshots)

CREATE TABLE IF NOT EXISTS key_review_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('grid_key','enum_key','component_key')),
  item_identifier TEXT,
  field_key TEXT NOT NULL,
  enum_value_norm TEXT,
  component_identifier TEXT,
  property_key TEXT,
  item_field_state_id INTEGER REFERENCES item_field_state(id),
  component_value_id INTEGER REFERENCES component_values(id),
  component_identity_id INTEGER REFERENCES component_identity(id),
  list_value_id INTEGER REFERENCES list_values(id),
  enum_list_id INTEGER REFERENCES enum_lists(id),

  required_level TEXT,
  availability TEXT,
  difficulty TEXT,
  effort INTEGER,
  ai_mode TEXT,
  parse_template TEXT,
  evidence_policy TEXT,
  min_evidence_refs_effective INTEGER DEFAULT 1,
  min_distinct_sources_required INTEGER DEFAULT 1,

  send_mode TEXT CHECK(send_mode IN ('single_source_data','all_source_data')),
  component_send_mode TEXT CHECK(component_send_mode IN ('component_values','component_values_prime_sources')),
  list_send_mode TEXT CHECK(list_send_mode IN ('list_values','list_values_prime_sources')),

  selected_value TEXT,
  selected_candidate_id TEXT,
  confidence_score REAL DEFAULT 0,
  confidence_level TEXT,
  flagged_at TEXT,
  resolved_at TEXT,

  ai_confirm_primary_status TEXT,
  ai_confirm_primary_confidence REAL,
  ai_confirm_primary_at TEXT,
  ai_confirm_primary_interrupted INTEGER DEFAULT 0,
  ai_confirm_primary_error TEXT,
  ai_confirm_shared_status TEXT,
  ai_confirm_shared_confidence REAL,
  ai_confirm_shared_at TEXT,
  ai_confirm_shared_interrupted INTEGER DEFAULT 0,
  ai_confirm_shared_error TEXT,

  user_accept_primary_status TEXT,
  user_accept_primary_at TEXT,
  user_accept_primary_by TEXT,
  user_accept_shared_status TEXT,
  user_accept_shared_at TEXT,
  user_accept_shared_by TEXT,

  user_override_ai_primary INTEGER DEFAULT 0,
  user_override_ai_primary_at TEXT,
  user_override_ai_primary_reason TEXT,
  user_override_ai_shared INTEGER DEFAULT 0,
  user_override_ai_shared_at TEXT,
  user_override_ai_shared_reason TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS key_review_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_review_state_id INTEGER NOT NULL REFERENCES key_review_state(id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  model_used TEXT,
  prompt_hash TEXT,
  response_schema_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd REAL,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS key_review_run_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_review_run_id INTEGER NOT NULL REFERENCES key_review_runs(run_id),
  assertion_id TEXT NOT NULL,
  packet_role TEXT,
  position INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS key_review_audit (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_review_state_id INTEGER NOT NULL REFERENCES key_review_state(id),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_grid
  ON key_review_state(category, item_identifier, field_key)
  WHERE target_kind = 'grid_key';

CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_enum
  ON key_review_state(category, field_key, enum_value_norm)
  WHERE target_kind = 'enum_key';

CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_component
  ON key_review_state(category, component_identifier, property_key)
  WHERE target_kind = 'component_key';

CREATE INDEX IF NOT EXISTS idx_krs_kind ON key_review_state(category, target_kind, field_key);
CREATE INDEX IF NOT EXISTS idx_krs_selected_candidate ON key_review_state(category, selected_candidate_id);
CREATE INDEX IF NOT EXISTS idx_krr_state ON key_review_runs(key_review_state_id, stage, status);

-- Migration Phase 2: Billing entries
CREATE TABLE IF NOT EXISTS billing_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  month TEXT NOT NULL,
  day TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'unknown',
  model TEXT NOT NULL DEFAULT 'unknown',
  category TEXT DEFAULT '',
  product_id TEXT DEFAULT '',
  run_id TEXT DEFAULT '',
  round INTEGER DEFAULT 0,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cached_prompt_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  reason TEXT DEFAULT 'extract',
  host TEXT DEFAULT '',
  url_count INTEGER DEFAULT 0,
  evidence_chars INTEGER DEFAULT 0,
  estimated_usage INTEGER DEFAULT 0,
  meta TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_be_month ON billing_entries(month);
CREATE INDEX IF NOT EXISTS idx_be_product ON billing_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_be_day ON billing_entries(day);

-- Data authority sync state
CREATE TABLE IF NOT EXISTS data_authority_sync (
  category TEXT PRIMARY KEY,
  specdb_sync_version INTEGER NOT NULL DEFAULT 0,
  last_sync_status TEXT DEFAULT 'unknown',
  last_sync_at TEXT,
  last_sync_meta TEXT DEFAULT '{}'
);

-- Bridge events: transformed runtime events for GUI readers (mirrors run_events.ndjson shape)
CREATE TABLE IF NOT EXISTS bridge_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  ts TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_be_run_id ON bridge_events(run_id);
CREATE INDEX IF NOT EXISTS idx_be_run_stage ON bridge_events(run_id, stage);

-- Run metadata: replaces per-run run.json mid-run overwrites (Wave 2)
-- WHY: Wave 5.5 slimmed this table. GUI telemetry (boot_step, boot_progress,
-- startup_ms, stages, browser_pool, needset_summary, search_profile_summary,
-- artifacts, extra) now lives in run-summary.json written at finalize.
-- This table holds only the product-relevant run record.
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL DEFAULT '',
  ended_at TEXT NOT NULL DEFAULT '',
  stage_cursor TEXT NOT NULL DEFAULT '',
  identity_fingerprint TEXT NOT NULL DEFAULT '',
  identity_lock_status TEXT NOT NULL DEFAULT '',
  dedupe_mode TEXT NOT NULL DEFAULT '',
  s3key TEXT NOT NULL DEFAULT '',
  out_root TEXT NOT NULL DEFAULT '',
  counters TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id)
);
CREATE INDEX IF NOT EXISTS idx_runs_category ON runs(category);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(category, status);
CREATE INDEX IF NOT EXISTS idx_runs_product ON runs(category, product_id);

-- Per-run artifacts: replaces needset.json / search_profile.json / brand_resolution.json (Wave 3)
CREATE TABLE IF NOT EXISTS run_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL DEFAULT '',
  artifact_type TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id, artifact_type)
);
CREATE INDEX IF NOT EXISTS idx_rart_run_id ON run_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_rart_category ON run_artifacts(category);

-- source_strategy table removed: sources.json is now the SSOT (see sourceFileService.js)

-- Artifact storage: content-addressed binary index (HTML, screenshots, PDFs on disk; SQL points to them)

CREATE TABLE IF NOT EXISTS crawl_sources (
  content_hash       TEXT NOT NULL,
  category           TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  run_id             TEXT NOT NULL,
  source_url         TEXT NOT NULL,
  final_url          TEXT NOT NULL DEFAULT '',
  host               TEXT NOT NULL DEFAULT '',
  http_status        INTEGER DEFAULT 0,
  doc_kind           TEXT NOT NULL DEFAULT 'other',
  source_tier        INTEGER DEFAULT 5,
  content_type       TEXT NOT NULL DEFAULT '',
  size_bytes         INTEGER DEFAULT 0,
  file_path          TEXT NOT NULL DEFAULT '',
  has_screenshot     INTEGER DEFAULT 0,
  has_pdf            INTEGER DEFAULT 0,
  has_ldjson         INTEGER DEFAULT 0,
  has_dom_snippet    INTEGER DEFAULT 0,
  crawled_at         TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (content_hash, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_product ON crawl_sources(product_id);
CREATE INDEX IF NOT EXISTS idx_cs_run ON crawl_sources(run_id);
CREATE INDEX IF NOT EXISTS idx_cs_host ON crawl_sources(host);

CREATE TABLE IF NOT EXISTS source_screenshots (
  screenshot_id      TEXT PRIMARY KEY,
  content_hash       TEXT NOT NULL,
  category           TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  run_id             TEXT NOT NULL,
  source_url         TEXT NOT NULL DEFAULT '',
  host               TEXT NOT NULL DEFAULT '',
  selector           TEXT NOT NULL DEFAULT 'fullpage',
  format             TEXT NOT NULL DEFAULT 'jpg',
  width              INTEGER DEFAULT 0,
  height             INTEGER DEFAULT 0,
  size_bytes         INTEGER DEFAULT 0,
  file_path          TEXT NOT NULL DEFAULT '',
  captured_at        TEXT NOT NULL DEFAULT '',
  doc_kind           TEXT NOT NULL DEFAULT 'other',
  source_tier        INTEGER DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_ss_product ON source_screenshots(product_id);
CREATE INDEX IF NOT EXISTS idx_ss_content ON source_screenshots(content_hash);

CREATE TABLE IF NOT EXISTS source_videos (
  video_id           TEXT PRIMARY KEY,
  content_hash       TEXT NOT NULL DEFAULT '',
  category           TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  run_id             TEXT NOT NULL,
  source_url         TEXT NOT NULL DEFAULT '',
  host               TEXT NOT NULL DEFAULT '',
  worker_id          TEXT NOT NULL DEFAULT '',
  format             TEXT NOT NULL DEFAULT 'webm',
  width              INTEGER DEFAULT 0,
  height             INTEGER DEFAULT 0,
  size_bytes         INTEGER DEFAULT 0,
  duration_ms        INTEGER DEFAULT 0,
  file_path          TEXT NOT NULL DEFAULT '',
  captured_at        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sv_product ON source_videos(product_id);
CREATE INDEX IF NOT EXISTS idx_sv_run ON source_videos(run_id);

-- Telemetry indexes (replaces NDJSON files in INDEXLAB_ROOT/{category}/)

CREATE TABLE IF NOT EXISTS knob_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  run_id TEXT,
  ts TEXT NOT NULL,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  total_knobs INTEGER NOT NULL DEFAULT 0,
  entries TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS query_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  run_id TEXT,
  product_id TEXT,
  query TEXT,
  provider TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  field_yield TEXT,
  tier TEXT DEFAULT NULL,
  ts TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qi_cat ON query_index(category);
CREATE INDEX IF NOT EXISTS idx_qi_run ON query_index(run_id);
CREATE INDEX IF NOT EXISTS idx_qi_query ON query_index(query, provider);

CREATE TABLE IF NOT EXISTS url_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  run_id TEXT,
  url TEXT,
  host TEXT,
  tier TEXT,
  doc_kind TEXT,
  fields_filled TEXT,
  fetch_success INTEGER NOT NULL DEFAULT 0,
  ts TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ui_cat ON url_index(category);
CREATE INDEX IF NOT EXISTS idx_ui_run ON url_index(run_id);
CREATE INDEX IF NOT EXISTS idx_ui_host ON url_index(host);

CREATE TABLE IF NOT EXISTS prompt_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  run_id TEXT,
  prompt_version TEXT,
  model TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1,
  ts TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pi_cat ON prompt_index(category);
CREATE INDEX IF NOT EXISTS idx_pi_run ON prompt_index(run_id);

-- URL crawl ledger (per-product URL fetch history, rebuildable from product.json)
CREATE TABLE IF NOT EXISTS url_crawl_ledger (
  canonical_url      TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT '',
  original_url       TEXT NOT NULL DEFAULT '',
  domain             TEXT NOT NULL DEFAULT '',
  path_sig           TEXT NOT NULL DEFAULT '',
  final_url          TEXT NOT NULL DEFAULT '',
  content_hash       TEXT NOT NULL DEFAULT '',
  content_type       TEXT NOT NULL DEFAULT '',
  http_status        INTEGER DEFAULT 0,
  bytes              INTEGER DEFAULT 0,
  elapsed_ms         INTEGER DEFAULT 0,
  fetch_count        INTEGER DEFAULT 1,
  ok_count           INTEGER DEFAULT 0,
  blocked_count      INTEGER DEFAULT 0,
  timeout_count      INTEGER DEFAULT 0,
  server_error_count INTEGER DEFAULT 0,
  redirect_count     INTEGER DEFAULT 0,
  notfound_count     INTEGER DEFAULT 0,
  gone_count         INTEGER DEFAULT 0,
  first_seen_ts      TEXT NOT NULL DEFAULT '',
  last_seen_ts       TEXT NOT NULL DEFAULT '',
  first_seen_run_id  TEXT NOT NULL DEFAULT '',
  last_seen_run_id   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (canonical_url, product_id)
);
CREATE INDEX IF NOT EXISTS idx_ucl_product ON url_crawl_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_ucl_domain ON url_crawl_ledger(domain);

-- Query cooldowns (per-product query TTL, ephemeral — not checkpointed)
CREATE TABLE IF NOT EXISTS query_cooldowns (
  query_hash         TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT '',
  query_text         TEXT NOT NULL,
  provider           TEXT NOT NULL DEFAULT '',
  tier               TEXT DEFAULT NULL,
  group_key          TEXT DEFAULT NULL,
  normalized_key     TEXT DEFAULT NULL,
  hint_source        TEXT DEFAULT NULL,
  attempt_count      INTEGER DEFAULT 1,
  result_count       INTEGER DEFAULT 0,
  last_executed_at   TEXT NOT NULL DEFAULT '',
  cooldown_until     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (query_hash, product_id)
);
CREATE INDEX IF NOT EXISTS idx_qc_product ON query_cooldowns(product_id);
CREATE INDEX IF NOT EXISTS idx_qc_cooldown ON query_cooldowns(cooldown_until);

-- Field studio map (per-category control-plane config persisted in SQL)
-- compiled_rules: full compiled field rules from _generated/field_rules.json + derived metadata
-- boot_config: pipeline boot config (source_hosts, denylist, search_templates, etc.)
CREATE TABLE IF NOT EXISTS field_studio_map (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  map_json TEXT NOT NULL DEFAULT '{}',
  map_hash TEXT NOT NULL DEFAULT '',
  compiled_rules TEXT NOT NULL DEFAULT '{}',
  boot_config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Field key order (instant order persistence for drag-drop, no version bump)
CREATE TABLE IF NOT EXISTS field_key_order (
  category TEXT PRIMARY KEY,
  order_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- Color & Edition Finder (per-product LLM discovery summary, rebuildable from product JSON)
CREATE TABLE IF NOT EXISTS color_edition_finder (
  category        TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  colors          TEXT DEFAULT '[]',
  editions        TEXT DEFAULT '[]',
  default_color   TEXT DEFAULT '',
  cooldown_until  TEXT DEFAULT '',
  latest_ran_at   TEXT DEFAULT '',
  run_count       INTEGER DEFAULT 0,
  PRIMARY KEY (category, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cef_cooldown ON color_edition_finder(cooldown_until);

-- Color & Edition Finder Runs (per-run LLM discovery detail, rebuildable from product JSON)
CREATE TABLE IF NOT EXISTS color_edition_finder_runs (
  category        TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  run_number      INTEGER NOT NULL,
  ran_at          TEXT DEFAULT '',
  model           TEXT DEFAULT 'unknown',
  fallback_used   INTEGER DEFAULT 0,
  cooldown_until  TEXT DEFAULT '',
  selected_json   TEXT DEFAULT '{}',
  prompt_json     TEXT DEFAULT '{}',
  response_json   TEXT DEFAULT '{}',
  UNIQUE(category, product_id, run_number)
);
CREATE INDEX IF NOT EXISTS idx_cefr_product
  ON color_edition_finder_runs(category, product_id);
`;

// WHY: Single source of truth for llm_route_matrix columns (excluding structural
// cols id, category, created_at, updated_at). Adding a column = one entry here.
// promptFlag: appears in the studio prompt context flags group.
// componentOnly: defaults to 1 for component scope, 0 for field scope.
export const LLM_ROUTE_COLUMN_REGISTRY = Object.freeze([
  { key: 'scope', type: 'string', sqlDefault: 'field' },
  { key: 'route_key', type: 'string', sqlDefault: '' },
  { key: 'required_level', type: 'string', sqlDefault: 'expected' },
  { key: 'difficulty', type: 'string', sqlDefault: 'medium' },
  { key: 'availability', type: 'string', sqlDefault: 'expected' },
  { key: 'effort', type: 'int', sqlDefault: 3 },
  { key: 'effort_band', type: 'string', sqlDefault: '1-3' },
  { key: 'single_source_data', type: 'bool', sqlDefault: 1 },
  { key: 'all_source_data', type: 'bool', sqlDefault: 0 },
  { key: 'enable_websearch', type: 'bool', sqlDefault: 1 },
  { key: 'model_ladder_today', type: 'string', sqlDefault: 'gpt-5-low -> gpt-5-medium' },
  { key: 'all_sources_confidence_repatch', type: 'bool', sqlDefault: 1 },
  { key: 'max_tokens', type: 'int', sqlDefault: 4096 },
  { key: 'studio_key_navigation_sent_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_contract_rules_sent_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_extraction_guidance_sent_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_tooltip_or_description_sent_when_present', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_enum_options_sent_when_present', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_component_variance_constraints_sent_in_component_review', type: 'bool', sqlDefault: 1, promptFlag: true, componentOnly: true },
  { key: 'studio_parse_template_sent_direct_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_required_level_sent_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_component_entity_set_sent_when_component_field', type: 'bool', sqlDefault: 1, promptFlag: true, componentOnly: true },
  { key: 'studio_evidence_policy_sent_direct_in_extract_review', type: 'bool', sqlDefault: 1, promptFlag: true },
  { key: 'studio_variance_policy_sent_in_component_review', type: 'bool', sqlDefault: 1, promptFlag: true, componentOnly: true },
  { key: 'studio_constraints_sent_in_component_review', type: 'bool', sqlDefault: 1, promptFlag: true, componentOnly: true },
  { key: 'studio_send_booleans_prompted_to_model', type: 'bool', sqlDefault: 0, promptFlag: true },
  { key: 'scalar_linked_send', type: 'string', sqlDefault: 'scalar value + prime sources' },
  { key: 'component_values_send', type: 'string', sqlDefault: 'component values + prime sources' },
  { key: 'list_values_send', type: 'string', sqlDefault: 'list values prime sources' },
  { key: 'llm_output_min_evidence_refs_required', type: 'int', sqlDefault: 1 },
  { key: 'insufficient_evidence_action', type: 'string', sqlDefault: 'threshold_unmet' },
]);

// WHY: Derived from registry for backward compat with llmRouteSourceStore.js
export const LLM_ROUTE_BOOLEAN_KEYS = LLM_ROUTE_COLUMN_REGISTRY
  .filter(c => c.type === 'bool')
  .map(c => c.key);

// WHY: Per-table boolean key lists — SSOT for which columns are boolean.
// Used by hydrateRow/hydrateRows in specDbHelpers.js to convert 0/1 → true/false on read.
export const COMPONENT_VALUE_BOOLEAN_KEYS = Object.freeze(['needs_review', 'overridden']);
export const LIST_VALUE_BOOLEAN_KEYS = Object.freeze(['needs_review', 'overridden']);
export const ITEM_FIELD_STATE_BOOLEAN_KEYS = Object.freeze(['overridden', 'needs_ai_review', 'ai_review_complete']);
export const KEY_REVIEW_STATE_BOOLEAN_KEYS = Object.freeze(['ai_confirm_primary_interrupted', 'ai_confirm_shared_interrupted', 'user_override_ai_primary', 'user_override_ai_shared']);
export const PRODUCT_RUN_BOOLEAN_KEYS = Object.freeze(['is_latest', 'validated']);
export const BILLING_ENTRY_BOOLEAN_KEYS = Object.freeze(['estimated_usage']);

// WHY: SSOT for component identity property keys (synthetic __-prefixed keys).
// Used by keyReviewStore SQL exclusions and features/review contract shapes.
export const COMPONENT_IDENTITY_PROPERTY_KEYS = Object.freeze([
  '__name', '__maker', '__links', '__aliases',
]);
