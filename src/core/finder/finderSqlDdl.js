/**
 * Finder SQL DDL Generator.
 *
 * Generates CREATE TABLE + CREATE INDEX statements from finder module
 * manifests. Each module gets a summary table (common + custom columns),
 * a runs table (always the same shape), and optionally a settings table
 * for per-category module configuration.
 */

/**
 * @param {object[]} modules — array of finder module manifest objects
 * @returns {string[]} DDL statements (ready to execute on SQLite)
 */
export function generateFinderDdl(modules) {
  if (!modules || modules.length === 0) return [];

  const statements = [];

  for (const mod of modules) {
    // ── Summary table: common columns + module-specific columns ───
    const customCols = (mod.summaryColumns || [])
      .map(c => `  ${c.name} ${c.type} DEFAULT ${c.default}`)
      .join(',\n');

    const summaryDdl = [
      `CREATE TABLE IF NOT EXISTS ${mod.tableName} (`,
      `  category TEXT NOT NULL,`,
      `  product_id TEXT NOT NULL,`,
      customCols ? `${customCols},` : '',
      `  latest_ran_at TEXT DEFAULT '',`,
      `  run_count INTEGER DEFAULT 0,`,
      `  PRIMARY KEY (category, product_id)`,
      `);`,
    ].filter(Boolean).join('\n');

    statements.push(summaryDdl);

    // ── Runs table: always the same shape ─────────────────────────
    const runsDdl = [
      `CREATE TABLE IF NOT EXISTS ${mod.runsTableName} (`,
      `  category TEXT NOT NULL,`,
      `  product_id TEXT NOT NULL,`,
      `  run_number INTEGER NOT NULL,`,
      // WHY: Global rebuild-contract guardrail — shared DDL means every finder
      // (current + future) gets a real timestamp default. Empty-string defaults
      // would poison audit-log ORDER BY after a DB-deleted rebuild.
      `  ran_at TEXT NOT NULL DEFAULT (datetime('now')),`,
      // WHY: First-class timing — every finder persists the wall-clock start +
      // measured duration of the run so the Indexing panel can render
      // "date · time · duration" without embedding timing inside response_json.
      `  started_at TEXT DEFAULT NULL,`,
      `  duration_ms INTEGER DEFAULT NULL,`,
      `  model TEXT DEFAULT 'unknown',`,
      `  fallback_used INTEGER DEFAULT 0,`,
      `  effort_level TEXT DEFAULT '',`,
      `  access_mode TEXT DEFAULT '',`,
      `  thinking INTEGER DEFAULT 0,`,
      `  web_search INTEGER DEFAULT 0,`,
      `  selected_json TEXT DEFAULT '{}',`,
      `  prompt_json TEXT DEFAULT '{}',`,
      `  response_json TEXT DEFAULT '{}',`,
      `  UNIQUE(category, product_id, run_number)`,
      `);`,
    ].join('\n');

    statements.push(runsDdl);

    // ── Custom summary indexes ────────────────────────────────────
    for (const idx of (mod.summaryIndexes || [])) {
      statements.push(
        `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${mod.tableName}(${idx.columns.join(', ')});`
      );
    }

    // ── Standard runs index on (category, product_id) ─────────────
    statements.push(
      `CREATE INDEX IF NOT EXISTS idx_${mod.tableName}_runs_product ON ${mod.runsTableName}(category, product_id);`
    );

    // ── Settings table: per-category key-value config ───────────
    // WHY: Each module owns its own settings table. SpecDb is already
    // per-category, so no category column needed. Reseed rebuilds from
    // the JSON mirror in category_authority.
    if (Array.isArray(mod.settingsSchema) && mod.settingsSchema.length > 0) {
      const settingsTableName = `${mod.tableName}_settings`;
      statements.push([
        `CREATE TABLE IF NOT EXISTS ${settingsTableName} (`,
        `  key TEXT PRIMARY KEY,`,
        `  value TEXT NOT NULL DEFAULT '',`,
        `  updated_at TEXT NOT NULL DEFAULT (datetime('now'))`,
        `);`,
      ].join('\n'));
    }

    // ── Suppressions table: non-destructive discovery-log pruning ─
    // WHY: Users can suppress URLs/queries from prompt injection without
    // mutating run records. Accumulator subtracts these at read time.
    // Scope encoded via variant_id + mode (empty string = "all variants"/"any mode").
    // Rebuild contract: mirrored in JSON suppressions[] array — see finderJsonStore.
    const suppressionsTableName = `${mod.tableName}_suppressions`;
    statements.push([
      `CREATE TABLE IF NOT EXISTS ${suppressionsTableName} (`,
      `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
      `  category TEXT NOT NULL,`,
      `  product_id TEXT NOT NULL,`,
      `  item TEXT NOT NULL,`,
      `  kind TEXT NOT NULL CHECK (kind IN ('url','query')),`,
      `  variant_id TEXT NOT NULL DEFAULT '',`,
      `  mode TEXT NOT NULL DEFAULT '',`,
      `  suppressed_at TEXT NOT NULL DEFAULT (datetime('now')),`,
      `  UNIQUE(category, product_id, item, kind, variant_id, mode)`,
      `);`,
    ].join('\n'));
    statements.push(
      `CREATE INDEX IF NOT EXISTS idx_${mod.tableName}_supp_lookup ON ${suppressionsTableName}(product_id, kind, variant_id, mode);`
    );
  }

  return statements;
}
