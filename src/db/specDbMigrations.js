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
  `ALTER TABLE llm_route_matrix ADD COLUMN enable_websearch INTEGER DEFAULT 1`,
  `DROP TABLE IF EXISTS brands`,
  `DROP INDEX IF EXISTS idx_art_product`,
  `DROP TABLE IF EXISTS artifacts`,
  // WHY: scope column was added to the llm_route_matrix schema but existing databases
  // don't have it. The CREATE TABLE IF NOT EXISTS is a no-op for existing tables, so
  // the column must be added via ALTER TABLE before any index references it.
  `ALTER TABLE llm_route_matrix ADD COLUMN scope TEXT DEFAULT 'field'`,
  // WHY: Phase F — stable brand FK on products, enables O(1) rename cascade
  `ALTER TABLE products ADD COLUMN brand_identifier TEXT DEFAULT ''`,
  // WHY: Tier column on query_index — enables per-query tier display in run history panel.
  `ALTER TABLE query_index ADD COLUMN tier TEXT DEFAULT NULL`,
  `ALTER TABLE runs RENAME COLUMN phase_cursor TO stage_cursor`,
  // WHY: base_model enables proper model/variant dropdown separation in IndexLab.
  // model = full product name, base_model = family name, variant = differentiator.
  // The checkpoint reseed phase populates correct values from product.json files on every startup.
  `ALTER TABLE products ADD COLUMN base_model TEXT DEFAULT ''`,
  // WHY: field_studio_map is the single SSOT for compiled field rules.
  // compiled_rules holds full engine artifacts, boot_config holds pipeline boot data.
  `ALTER TABLE field_studio_map ADD COLUMN compiled_rules TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE field_studio_map ADD COLUMN boot_config TEXT NOT NULL DEFAULT '{}'`,
  // WHY: candidate-gate needs status tracking on field_candidates to distinguish
  // unresolved candidates from resolved ones.
  `ALTER TABLE field_candidates ADD COLUMN status TEXT DEFAULT 'candidate'`,
  `ALTER TABLE field_candidates ADD COLUMN metadata_json TEXT DEFAULT '{}'`,
  // WHY: Phase 2 unit normalization — store unit alongside value so it's queryable
  // and doesn't require field rule lookup to display.
  `ALTER TABLE field_candidates ADD COLUMN unit TEXT DEFAULT NULL`,
  `ALTER TABLE component_values ADD COLUMN unit TEXT DEFAULT NULL`,
  // WHY: Finder runs now persist effort_level and access_mode for LLM badge
  // rendering in run history. Existing DBs need the columns added.
  `ALTER TABLE color_edition_finder_runs ADD COLUMN effort_level TEXT DEFAULT ''`,
  `ALTER TABLE color_edition_finder_runs ADD COLUMN access_mode TEXT DEFAULT ''`,
  `ALTER TABLE product_image_finder_runs ADD COLUMN effort_level TEXT DEFAULT ''`,
  `ALTER TABLE product_image_finder_runs ADD COLUMN access_mode TEXT DEFAULT ''`,
];

export const SECONDARY_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_lrm_cat_scope ON llm_route_matrix(category, scope);
  CREATE INDEX IF NOT EXISTS idx_cv_identity_id ON component_values(component_identity_id);
  CREATE INDEX IF NOT EXISTS idx_lv_list_id ON list_values(list_id);
  CREATE INDEX IF NOT EXISTS idx_prod_brand_id ON products(category, brand_identifier);
`;

/**
 * Run all idempotent migrations against the given db handle.
 * @param {import('better-sqlite3').Database} db
 */
export function applyMigrations(db) {
  for (const sql of MIGRATIONS) {
    try { db.exec(sql); } catch (e) {
      if (!e.message.includes('duplicate column') && !e.message.includes('no such column') && !e.message.includes('no such table')) throw e;
    }
  }
  db.exec(SECONDARY_INDEXES);
}
