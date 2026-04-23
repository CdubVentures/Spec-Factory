/**
 * Idempotent ALTER TABLE migrations and secondary indexes for SpecDb.
 * Extracted from specDb.js constructor — zero logic, pure DDL.
 */

import { fingerprintValue } from './valueFingerprint.js';

export const MIGRATIONS = [
  `ALTER TABLE component_identity ADD COLUMN review_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE component_identity ADD COLUMN aliases_overridden INTEGER DEFAULT 0`,
  `ALTER TABLE component_values ADD COLUMN constraints TEXT`,
  `ALTER TABLE component_values ADD COLUMN component_identity_id INTEGER REFERENCES component_identity(id)`,
  `ALTER TABLE list_values ADD COLUMN source_timestamp TEXT`,
  `ALTER TABLE list_values ADD COLUMN list_id INTEGER REFERENCES enum_lists(id)`,
  `DROP TABLE IF EXISTS brands`,
  `DROP INDEX IF EXISTS idx_art_product`,
  `DROP TABLE IF EXISTS artifacts`,
  // WHY: retired llm_route_matrix table — the Review LLM panel is gone.
  `DROP TABLE IF EXISTS llm_route_matrix`,
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
  // WHY: Carousel Builder stores user slot overrides. Existing DBs need the column.
  `ALTER TABLE product_image_finder ADD COLUMN carousel_slots TEXT DEFAULT '{}'`,
  // WHY: Eval state stores per-image eval fields as a JSON blob for SQL projection.
  `ALTER TABLE product_image_finder ADD COLUMN eval_state TEXT DEFAULT '{}'`,
  // WHY: Source-centric candidates — each extraction event gets its own row keyed by source_id.
  // source_id is deterministic for finders (e.g. cef-{productId}-{runNumber}).
  // WHY: Finder runs now persist thinking and web_search capability flags
  // for LLM badge rendering in run history. Existing DBs need the columns.
  `ALTER TABLE color_edition_finder_runs ADD COLUMN thinking INTEGER DEFAULT 0`,
  `ALTER TABLE color_edition_finder_runs ADD COLUMN web_search INTEGER DEFAULT 0`,
  `ALTER TABLE product_image_finder_runs ADD COLUMN thinking INTEGER DEFAULT 0`,
  `ALTER TABLE product_image_finder_runs ADD COLUMN web_search INTEGER DEFAULT 0`,
  `ALTER TABLE field_candidates ADD COLUMN source_id TEXT DEFAULT ''`,
  `ALTER TABLE field_candidates ADD COLUMN source_type TEXT DEFAULT ''`,
  `ALTER TABLE field_candidates ADD COLUMN model TEXT DEFAULT ''`,
  // WHY: variant_registry blob retired — variants table is the SSOT. Drops the
  // column on existing DBs; "no such column" on fresh DBs is swallowed by
  // applyMigrations() try/catch.
  `ALTER TABLE color_edition_finder DROP COLUMN variant_registry`,
  // WHY: Evaluations array projected to SQL — runtime GET must read SQL per
  // CLAUDE.md Dual-State mandate. JSON stays as durable memory.
  `ALTER TABLE product_image_finder ADD COLUMN evaluations TEXT DEFAULT '[]'`,
  // WHY: URL verification projection — publisher HEAD-checks each evidence_ref
  // before accepting it. http_status is the observed HTTP code (NULL = unverified
  // legacy row; 0 = network error/invalid URL treated as unknown; 2xx = accepted;
  // 4xx/5xx = rejected). accepted=1 means the ref counts toward the candidate's
  // evidence; accepted=0 is kept in the DB so the publisher GUI can surface the
  // failed URL for human review.
  `ALTER TABLE field_candidate_evidence ADD COLUMN http_status INTEGER DEFAULT NULL`,
  `ALTER TABLE field_candidate_evidence ADD COLUMN verified_at TEXT DEFAULT NULL`,
  `ALTER TABLE field_candidate_evidence ADD COLUMN accepted INTEGER NOT NULL DEFAULT 1`,
  // WHY: evidence-upgrade — RDF + variantScalarFieldProducer tag each ref
  // with supporting_evidence (on-page quote or one-line reasoning) +
  // evidence_kind (10-value enum). NULL for legacy rebuilt rows; publisher
  // gate treats NULL as substantive so legacy data still passes.
  `ALTER TABLE field_candidate_evidence ADD COLUMN evidence_kind TEXT DEFAULT NULL`,
  `ALTER TABLE field_candidate_evidence ADD COLUMN supporting_evidence TEXT DEFAULT NULL`,
  // WHY: First-class timing on the shared finder_runs tables. New finders
  // inherit via the DDL generator; existing DBs need ALTER TABLE to add
  // started_at + duration_ms. NULL for runs persisted before this migration —
  // reseed from JSON top-level populates them on next rebuild.
  `ALTER TABLE color_edition_finder_runs ADD COLUMN started_at TEXT DEFAULT NULL`,
  `ALTER TABLE color_edition_finder_runs ADD COLUMN duration_ms INTEGER DEFAULT NULL`,
  `ALTER TABLE product_image_finder_runs ADD COLUMN started_at TEXT DEFAULT NULL`,
  `ALTER TABLE product_image_finder_runs ADD COLUMN duration_ms INTEGER DEFAULT NULL`,
  `ALTER TABLE release_date_finder_runs ADD COLUMN started_at TEXT DEFAULT NULL`,
  `ALTER TABLE release_date_finder_runs ADD COLUMN duration_ms INTEGER DEFAULT NULL`,
  // WHY: Suppressions tables retired — Stage A suppressions retirement. DDL no
  // longer creates <finder>_suppressions tables on fresh DBs. Existing DBs keep
  // the orphaned tables until reseed; applyMigrations() swallows "no such table"
  // errors, so dropping the ALTER statements here is safe on old + new DBs.
  `DROP TABLE IF EXISTS color_edition_finder_suppressions`,
  `DROP TABLE IF EXISTS product_image_finder_suppressions`,
  `DROP TABLE IF EXISTS release_date_finder_suppressions`,
  `DROP TABLE IF EXISTS sku_finder_suppressions`,
  `DROP TABLE IF EXISTS key_finder_suppressions`,
  // WHY: value_fingerprint pools evidence across candidate rows that agree on
  // the same value (scalar equality, list set-equality). Computed at insert
  // via valueFingerprint.js; backfilled for existing rows by
  // backfillValueFingerprints(). Empty string on unpopulated rows is safe —
  // backfill rewrites them on next boot.
  `ALTER TABLE field_candidates ADD COLUMN value_fingerprint TEXT DEFAULT ''`,
];

export const SECONDARY_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_cv_identity_id ON component_values(component_identity_id);
  CREATE INDEX IF NOT EXISTS idx_lv_list_id ON list_values(list_id);
  CREATE INDEX IF NOT EXISTS idx_prod_brand_id ON products(category, brand_identifier);
  CREATE INDEX IF NOT EXISTS idx_fc_source_id ON field_candidates(category, product_id, field_key, source_id);
  CREATE INDEX IF NOT EXISTS idx_fce_accepted ON field_candidate_evidence(candidate_id, accepted);
  CREATE INDEX IF NOT EXISTS idx_fc_fingerprint ON field_candidates(product_id, field_key, value_fingerprint, variant_id_key);
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
  migrateFieldCandidatesToSourceCentric(db);
  migrateFieldCandidatesAddVariantColumns(db);
  backfillValueFingerprints(db);
}

/**
 * Fingerprint backfill for field_candidates rows missing value_fingerprint.
 * Idempotent: skips rows that already have a non-empty fingerprint.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function backfillValueFingerprints(db) {
  const cols = db.pragma('table_info(field_candidates)');
  if (!cols.some(c => c.name === 'value_fingerprint')) return;

  const rows = db.prepare(
    "SELECT id, value FROM field_candidates WHERE value_fingerprint IS NULL OR value_fingerprint = ''"
  ).all();
  if (rows.length === 0) return;

  const update = db.prepare('UPDATE field_candidates SET value_fingerprint = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const row of rows) {
      const raw = row.value;
      let parsed = raw;
      if (typeof raw === 'string' && raw.length > 0 && (raw[0] === '[' || raw[0] === '{')) {
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
      }
      update.run(fingerprintValue(parsed), row.id);
    }
  });
  tx();
}

/**
 * Source-centric migration: recreate field_candidates with UNIQUE(source_id)
 * instead of UNIQUE(value). Explodes multi-source rows into individual rows.
 *
 * Idempotent: skips if already migrated (UNIQUE on source_id exists).
 * Wrapped in a transaction for atomicity.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function migrateFieldCandidatesToSourceCentric(db) {
  // WHY: Check if migration is needed — look for old UNIQUE(value) constraint.
  // If the table already has UNIQUE on source_id, skip.
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='field_candidates'").get();
  if (!tableInfo) return;

  const hasSrcIdUnique = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='index' AND tbl_name='field_candidates' AND sql LIKE '%UNIQUE%source_id%'"
  ).get();
  // WHY: Also check if inline UNIQUE constraint on source_id exists in table DDL
  if (hasSrcIdUnique || (tableInfo.sql && tableInfo.sql.includes('UNIQUE') && tableInfo.sql.includes('source_id') && !tableInfo.sql.includes('field_key, value'))) return;

  // WHY: Check if old constraint still has value-based UNIQUE
  const hasOldUnique = tableInfo.sql && tableInfo.sql.includes('field_key, value)');
  if (!hasOldUnique) return; // Already migrated or unknown schema

  // Read all existing rows
  const allRows = db.prepare('SELECT * FROM field_candidates').all();

  // Explode multi-source rows
  const exploded = [];
  for (const row of allRows) {
    let sources = [];
    try { sources = JSON.parse(row.sources_json || '[]'); } catch { sources = []; }
    if (!Array.isArray(sources)) sources = [];

    // WHY: If row already has source_id populated, keep as-is (already source-centric)
    if (row.source_id && row.source_id.length > 0) {
      exploded.push(row);
      continue;
    }

    if (sources.length === 0) {
      // No sources — assign synthetic legacy source_id
      exploded.push({ ...row, source_id: `legacy-${row.product_id}-${row.field_key}-${row.id}`, source_type: '', model: '' });
    } else if (sources.length === 1) {
      // Single source — 1:1 mapping
      const src = sources[0];
      const sourceId = src.run_number != null
        ? `${src.source || 'unknown'}-${row.product_id}-${src.run_number}`
        : (src.run_id ? `${src.source || 'unknown'}-${src.run_id}` : `legacy-${row.product_id}-${row.field_key}-${row.id}`);
      exploded.push({
        ...row,
        source_id: sourceId,
        source_type: src.source || '',
        model: src.model || '',
        confidence: src.confidence ?? row.confidence,
      });
    } else {
      // Multiple sources — explode into N rows
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const sourceId = src.run_number != null
          ? `${src.source || 'unknown'}-${row.product_id}-${src.run_number}`
          : (src.run_id ? `${src.source || 'unknown'}-${src.run_id}` : `legacy-${row.product_id}-${row.field_key}-${row.id}-${i}`);
        exploded.push({
          ...row,
          id: undefined, // auto-increment on re-insert
          source_id: sourceId,
          source_type: src.source || '',
          model: src.model || '',
          confidence: src.confidence ?? row.confidence,
          submitted_at: src.submitted_at || row.submitted_at,
        });
      }
    }
  }

  // Deduplicate by (category, product_id, field_key, source_id)
  const seen = new Set();
  const deduped = exploded.filter(r => {
    const key = `${r.category}|${r.product_id}|${r.field_key}|${r.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Recreate table with new UNIQUE constraint in a transaction
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE field_candidates_new (
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
        submitted_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(category, product_id, field_key, source_id)
      )
    `);

    const insert = db.prepare(`
      INSERT OR IGNORE INTO field_candidates_new
        (category, product_id, field_key, value, unit, confidence, source_id, source_type, model, validation_json, metadata_json, status, submitted_at, updated_at)
      VALUES
        (@category, @product_id, @field_key, @value, @unit, @confidence, @source_id, @source_type, @model, @validation_json, @metadata_json, @status, @submitted_at, @updated_at)
    `);

    for (const r of deduped) {
      insert.run({
        category: r.category || '',
        product_id: r.product_id || '',
        field_key: r.field_key || '',
        value: r.value ?? null,
        unit: r.unit ?? null,
        confidence: r.confidence ?? 0,
        source_id: r.source_id || '',
        source_type: r.source_type || '',
        model: r.model || '',
        validation_json: r.validation_json || '{}',
        metadata_json: r.metadata_json || '{}',
        status: r.status || 'candidate',
        submitted_at: r.submitted_at || null,
        updated_at: r.updated_at || null,
      });
    }

    db.exec('DROP TABLE field_candidates');
    db.exec('ALTER TABLE field_candidates_new RENAME TO field_candidates');

    // Recreate indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_fc_product ON field_candidates(product_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fc_field ON field_candidates(category, product_id, field_key)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fc_source_id ON field_candidates(category, product_id, field_key, source_id)');
  });

  tx();
}

/**
 * Variant-aware migration: recreate field_candidates with variant_id and
 * variant_id_key (generated column) plus updated UNIQUE constraint.
 *
 * WHY: SQLite does not support ALTER TABLE ADD COLUMN for generated columns,
 * so the table must be recreated. Preserves all existing data — variant_id
 * defaults to NULL for existing rows (variant_id_key → '' via COALESCE).
 *
 * Idempotent: skips if variant_id column already exists.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function migrateFieldCandidatesAddVariantColumns(db) {
  const cols = db.pragma('table_info(field_candidates)');
  if (cols.some(c => c.name === 'variant_id')) return;

  const allRows = db.prepare('SELECT * FROM field_candidates').all();

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE field_candidates_v2 (
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
        variant_id_key TEXT GENERATED ALWAYS AS (COALESCE(variant_id, '')) STORED,
        submitted_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(category, product_id, field_key, source_id, variant_id_key)
      )
    `);

    const insert = db.prepare(`
      INSERT OR IGNORE INTO field_candidates_v2
        (category, product_id, field_key, value, unit, confidence,
         source_id, source_type, model, validation_json, metadata_json,
         status, variant_id, submitted_at, updated_at)
      VALUES
        (@category, @product_id, @field_key, @value, @unit, @confidence,
         @source_id, @source_type, @model, @validation_json, @metadata_json,
         @status, NULL, @submitted_at, @updated_at)
    `);

    for (const r of allRows) {
      insert.run({
        category: r.category || '',
        product_id: r.product_id || '',
        field_key: r.field_key || '',
        value: r.value ?? null,
        unit: r.unit ?? null,
        confidence: r.confidence ?? 0,
        source_id: r.source_id || '',
        source_type: r.source_type || '',
        model: r.model || '',
        validation_json: r.validation_json || '{}',
        metadata_json: r.metadata_json || '{}',
        status: r.status || 'candidate',
        submitted_at: r.submitted_at || null,
        updated_at: r.updated_at || null,
      });
    }

    db.exec('DROP TABLE field_candidates');
    db.exec('ALTER TABLE field_candidates_v2 RENAME TO field_candidates');

    db.exec('CREATE INDEX IF NOT EXISTS idx_fc_product ON field_candidates(product_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fc_field ON field_candidates(category, product_id, field_key)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_fc_source_id ON field_candidates(category, product_id, field_key, source_id)');
  });

  tx();
}
