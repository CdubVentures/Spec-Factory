/**
 * Idempotent ALTER TABLE migrations and secondary indexes for SpecDb.
 * Extracted from specDb.js constructor — zero logic, pure DDL.
 */

export const MIGRATIONS = [
  `ALTER TABLE component_identity ADD COLUMN review_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE component_identity ADD COLUMN aliases_overridden INTEGER DEFAULT 0`,
  `ALTER TABLE component_values ADD COLUMN constraints TEXT`,
  `ALTER TABLE component_values ADD COLUMN component_identity_id INTEGER REFERENCES component_identity(id)`,
  `ALTER TABLE list_values ADD COLUMN source_timestamp TEXT`,
  `ALTER TABLE list_values ADD COLUMN list_id INTEGER REFERENCES enum_lists(id)`,
  `ALTER TABLE source_assertions ADD COLUMN item_field_state_id INTEGER REFERENCES item_field_state(id)`,
  `ALTER TABLE source_assertions ADD COLUMN component_value_id INTEGER REFERENCES component_values(id)`,
  `ALTER TABLE source_assertions ADD COLUMN list_value_id INTEGER REFERENCES list_values(id)`,
  `ALTER TABLE source_assertions ADD COLUMN enum_list_id INTEGER REFERENCES enum_lists(id)`,
  `ALTER TABLE key_review_state ADD COLUMN item_field_state_id INTEGER REFERENCES item_field_state(id)`,
  `ALTER TABLE key_review_state ADD COLUMN component_value_id INTEGER REFERENCES component_values(id)`,
  `ALTER TABLE key_review_state ADD COLUMN component_identity_id INTEGER REFERENCES component_identity(id)`,
  `ALTER TABLE key_review_state ADD COLUMN list_value_id INTEGER REFERENCES list_values(id)`,
  `ALTER TABLE key_review_state ADD COLUMN enum_list_id INTEGER REFERENCES enum_lists(id)`,
  `ALTER TABLE llm_route_matrix ADD COLUMN enable_websearch INTEGER DEFAULT 1`,
  `ALTER TABLE product_runs ADD COLUMN storage_state TEXT DEFAULT 'live'`,
  `ALTER TABLE product_runs ADD COLUMN local_path TEXT DEFAULT ''`,
  `ALTER TABLE product_runs ADD COLUMN s3_key TEXT DEFAULT ''`,
  `ALTER TABLE product_runs ADD COLUMN size_bytes INTEGER DEFAULT 0`,
  `ALTER TABLE product_runs ADD COLUMN relocated_at TEXT DEFAULT ''`,
  `DROP TABLE IF EXISTS brands`,
  `DROP INDEX IF EXISTS idx_art_product`,
  `DROP TABLE IF EXISTS artifacts`,
  // WHY: Phase E2 — override provenance columns so readers can migrate from JSON files to SQL
  `ALTER TABLE item_field_state ADD COLUMN override_source TEXT`,
  `ALTER TABLE item_field_state ADD COLUMN override_value TEXT`,
  `ALTER TABLE item_field_state ADD COLUMN override_reason TEXT`,
  `ALTER TABLE item_field_state ADD COLUMN override_provenance TEXT`,
  `ALTER TABLE item_field_state ADD COLUMN overridden_by TEXT`,
  `ALTER TABLE item_field_state ADD COLUMN overridden_at TEXT`,
  // WHY: scope column was added to the llm_route_matrix schema but existing databases
  // don't have it. The CREATE TABLE IF NOT EXISTS is a no-op for existing tables, so
  // the column must be added via ALTER TABLE before any index references it.
  `ALTER TABLE llm_route_matrix ADD COLUMN scope TEXT DEFAULT 'field'`,
  // WHY: Phase F — stable brand FK on products, enables O(1) rename cascade
  `ALTER TABLE products ADD COLUMN brand_identifier TEXT DEFAULT ''`,
  // WHY: source_intel consolidation — brands/paths folded into source_intel_domains
  // with scope/scope_key columns. PK change requires DROP + recreate. Data is
  // rebuilt on next pipeline run via persistSourceIntelFull().
  `DROP TABLE IF EXISTS source_intel_domains`,
  `DROP TABLE IF EXISTS source_intel_brands`,
  `DROP TABLE IF EXISTS source_intel_paths`,
  // WHY: Recreate source_intel_domains with composite PK after DROP above.
  // Schema's CREATE TABLE IF NOT EXISTS was a no-op for existing DBs, so
  // the migration must explicitly create the new table.
  `CREATE TABLE IF NOT EXISTS source_intel_domains (
    root_domain TEXT NOT NULL,
    category TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'domain',
    scope_key TEXT NOT NULL DEFAULT '',
    brand TEXT DEFAULT '',
    attempts INTEGER DEFAULT 0,
    http_ok_count INTEGER DEFAULT 0,
    identity_match_count INTEGER DEFAULT 0,
    major_anchor_conflict_count INTEGER DEFAULT 0,
    fields_contributed_count INTEGER DEFAULT 0,
    fields_accepted_count INTEGER DEFAULT 0,
    accepted_critical_fields_count INTEGER DEFAULT 0,
    products_seen INTEGER DEFAULT 0,
    approved_attempts INTEGER DEFAULT 0,
    candidate_attempts INTEGER DEFAULT 0,
    parser_runs INTEGER DEFAULT 0,
    parser_success_count INTEGER DEFAULT 0,
    parser_health_score_total REAL DEFAULT 0,
    endpoint_signal_count INTEGER DEFAULT 0,
    endpoint_signal_score_total REAL DEFAULT 0,
    planner_score REAL DEFAULT 0,
    field_reward_strength REAL DEFAULT 0,
    recent_products TEXT DEFAULT '[]',
    per_field_helpfulness TEXT DEFAULT '{}',
    fingerprint_counts TEXT DEFAULT '{}',
    extra_stats TEXT DEFAULT '{}',
    last_seen_at TEXT,
    updated_at TEXT,
    PRIMARY KEY (root_domain, category, scope, scope_key)
  )`,
  // WHY: Tier column on query_index — enables per-query tier display in run history panel.
  `ALTER TABLE query_index ADD COLUMN tier TEXT DEFAULT NULL`,
  `ALTER TABLE runs RENAME COLUMN phase_cursor TO stage_cursor`,
];

export const SECONDARY_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_lrm_cat_scope ON llm_route_matrix(category, scope);
  CREATE INDEX IF NOT EXISTS idx_sid_scope ON source_intel_domains(root_domain, scope);
  CREATE INDEX IF NOT EXISTS idx_cv_identity_id ON component_values(component_identity_id);
  CREATE INDEX IF NOT EXISTS idx_lv_list_id ON list_values(list_id);
  CREATE INDEX IF NOT EXISTS idx_sa_item_slot ON source_assertions(item_field_state_id);
  CREATE INDEX IF NOT EXISTS idx_sa_component_slot ON source_assertions(component_value_id);
  CREATE INDEX IF NOT EXISTS idx_sa_list_slot ON source_assertions(list_value_id, enum_list_id);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_grid_slot ON key_review_state(category, item_field_state_id)
    WHERE target_kind = 'grid_key' AND item_field_state_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_enum_slot ON key_review_state(category, list_value_id)
    WHERE target_kind = 'enum_key' AND list_value_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_component_slot ON key_review_state(category, component_value_id)
    WHERE target_kind = 'component_key' AND component_value_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_component_identity_slot ON key_review_state(category, component_identity_id, property_key)
    WHERE target_kind = 'component_key' AND component_identity_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_krs_item_slot ON key_review_state(item_field_state_id);
  CREATE INDEX IF NOT EXISTS idx_krs_component_slot ON key_review_state(component_value_id);
  CREATE INDEX IF NOT EXISTS idx_krs_component_identity_slot ON key_review_state(component_identity_id, property_key);
  CREATE INDEX IF NOT EXISTS idx_krs_list_slot ON key_review_state(list_value_id, enum_list_id);
  CREATE INDEX IF NOT EXISTS idx_pr_storage_state ON product_runs(storage_state);
  CREATE INDEX IF NOT EXISTS idx_prod_brand_id ON products(category, brand_identifier);
`;

/**
 * Run all idempotent migrations against the given db handle.
 * @param {import('better-sqlite3').Database} db
 */
export function applyMigrations(db) {
  for (const sql of MIGRATIONS) {
    try { db.exec(sql); } catch (e) {
      if (!e.message.includes('duplicate column') && !e.message.includes('no such column')) throw e;
    }
  }
  db.exec(SECONDARY_INDEXES);
}
