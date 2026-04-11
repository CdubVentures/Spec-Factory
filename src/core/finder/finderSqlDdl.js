/**
 * Finder SQL DDL Generator.
 *
 * Generates CREATE TABLE + CREATE INDEX statements from finder module
 * manifests. Each module gets a summary table (common + custom columns)
 * and a runs table (always the same shape).
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
      `  cooldown_until TEXT DEFAULT '',`,
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
      `  ran_at TEXT DEFAULT '',`,
      `  model TEXT DEFAULT 'unknown',`,
      `  fallback_used INTEGER DEFAULT 0,`,
      `  cooldown_until TEXT DEFAULT '',`,
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
  }

  return statements;
}
