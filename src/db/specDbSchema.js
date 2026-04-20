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
  unit TEXT DEFAULT NULL,
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
CREATE INDEX IF NOT EXISTS idx_icl_product ON item_component_links(product_id);
CREATE INDEX IF NOT EXISTS idx_ill_product ON item_list_links(product_id);
CREATE INDEX IF NOT EXISTS idx_icl_component ON item_component_links(category, component_type, component_name, component_maker);
CREATE INDEX IF NOT EXISTS idx_ill_list_value ON item_list_links(list_value_id);

CREATE TABLE IF NOT EXISTS field_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  product_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT,
  unit TEXT DEFAULT NULL,
  confidence REAL DEFAULT 0,
  source_id TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  model TEXT DEFAULT '',
  validation_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  status TEXT DEFAULT 'candidate' CHECK(status IN ('candidate', 'resolved')),
  variant_id TEXT DEFAULT NULL,
  -- WHY: SQLite treats NULL as distinct in UNIQUE constraints, so ON CONFLICT
  -- never fires for NULL variant_id rows. This generated column converts NULL
  -- to '' for UNIQUE purposes while keeping the real variant_id as NULL.
  variant_id_key TEXT GENERATED ALWAYS AS (COALESCE(variant_id, '')) STORED,
  submitted_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id, field_key, source_id, variant_id_key)
);

CREATE INDEX IF NOT EXISTS idx_fc_product ON field_candidates(product_id);
CREATE INDEX IF NOT EXISTS idx_fc_field ON field_candidates(category, product_id, field_key);

-- WHY: Relational projection of metadata_json.evidence_refs for CEF + RDF.
-- JSON in metadata_json remains canonical (SSOT). This table is a read-side
-- projection so tier/confidence queries are indexed. Cascade delete keeps
-- evidence tied to its candidate — variant scope derives via candidate.variant_id.
CREATE TABLE IF NOT EXISTS field_candidate_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES field_candidates(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  tier TEXT NOT NULL,
  confidence REAL,
  http_status INTEGER DEFAULT NULL,
  verified_at TEXT DEFAULT NULL,
  accepted INTEGER NOT NULL DEFAULT 1,
  -- WHY: evidence-upgrade columns. evidence_kind is one of 10 enum values
  -- (direct_quote, structured_metadata, byline_timestamp, artifact_metadata,
  -- visual_inspection, lab_measurement, comparative_rebadge,
  -- inferred_reasoning, absence_of_evidence, identity_only). NULL means
  -- pre-upgrade legacy row; publisher gate treats NULL as substantive
  -- (counts toward min_evidence_refs). Only RDF + variantScalarFieldProducer
  -- populate these; CEF + PIF keep the base shape.
  evidence_kind TEXT DEFAULT NULL,
  supporting_evidence TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fce_candidate ON field_candidate_evidence(candidate_id);
CREATE INDEX IF NOT EXISTS idx_fce_tier ON field_candidate_evidence(tier);
-- WHY: idx_fce_accepted lives in specDbMigrations.js SECONDARY_INDEXES,
-- created after the idempotent ALTER TABLE adds the accepted column.
-- Placing the index here would fail on existing DBs where the column does not yet exist.

-- Phase 2 tables

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, product_id TEXT NOT NULL,
  brand TEXT DEFAULT '', model TEXT DEFAULT '', base_model TEXT DEFAULT '', variant TEXT DEFAULT '',
  status TEXT DEFAULT 'active', identifier TEXT, brand_identifier TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category);


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

-- Field contract audit cache (full audit result per category, rebuild from re-run)
CREATE TABLE IF NOT EXISTS field_audit_cache (
  category TEXT PRIMARY KEY,
  total_fields INTEGER NOT NULL DEFAULT 0,
  total_checks INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  run_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS variants (
  category             TEXT NOT NULL,
  product_id           TEXT NOT NULL,
  variant_id           TEXT NOT NULL,
  variant_key          TEXT NOT NULL,
  variant_type         TEXT NOT NULL CHECK(variant_type IN ('color','edition')),
  variant_label        TEXT DEFAULT '',
  color_atoms          TEXT DEFAULT '[]',
  edition_slug         TEXT,
  edition_display_name TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT,
  PRIMARY KEY (category, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_variants_product
  ON variants(category, product_id);
`;

// WHY: Per-table boolean key lists — SSOT for which columns are boolean.
// Used by hydrateRow/hydrateRows in specDbHelpers.js to convert 0/1 → true/false on read.
export const COMPONENT_VALUE_BOOLEAN_KEYS = Object.freeze(['needs_review', 'overridden']);
export const LIST_VALUE_BOOLEAN_KEYS = Object.freeze(['needs_review', 'overridden']);
// WHY: BILLING_ENTRY_BOOLEAN_KEYS moved to appDb.js — billing is now global.

// WHY: SSOT for component identity property keys (synthetic __-prefixed keys).
// Used by features/review contract shapes.
export const COMPONENT_IDENTITY_PROPERTY_KEYS = Object.freeze([
  '__name', '__maker', '__links', '__aliases',
]);
