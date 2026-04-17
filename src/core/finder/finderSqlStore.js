/**
 * Generic Finder SQL Store Factory.
 *
 * Creates a standard SQL store for any finder module from its manifest.
 * Each store manages a summary table (custom columns), a runs table
 * (standard shape), and optionally a settings table (per-category
 * key-value config). Statements are prepared at construction time.
 *
 * Hydrates JSON columns (selected_json, prompt_json, response_json)
 * on read. Serializes them on write.
 */

import { deriveFinderSettingsDefaults } from './finderSettingsSchema.js';

function safeJsonParse(str, fallback) {
  if (!str || typeof str !== 'string') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function hydrateRunRow(row) {
  if (!row) return null;
  return {
    ...row,
    selected: safeJsonParse(row.selected_json, {}),
    prompt: safeJsonParse(row.prompt_json, {}),
    response: safeJsonParse(row.response_json, {}),
    fallback_used: Boolean(row.fallback_used),
    thinking: Boolean(row.thinking),
    web_search: Boolean(row.web_search),
  };
}

/**
 * @param {object} opts
 * @param {object} opts.db — better-sqlite3 Database instance
 * @param {string} opts.category — category scope for all operations
 * @param {object} opts.module — finder module manifest (tableName, runsTableName, summaryColumns)
 * @returns {object} store with upsert, get, listByCategory, remove, insertRun, listRuns, getLatestRun, removeRun, removeAllRuns
 */
export function createFinderSqlStore({ db, category, module: mod }) {
  const { tableName, runsTableName, summaryColumns = [], settingsSchema } = mod;
  // WHY: Derive the legacy { key: stringDefault } map from the schema once.
  // All downstream read-through logic keeps operating on this shape.
  const settingsDefaults = Array.isArray(settingsSchema) && settingsSchema.length > 0
    ? deriveFinderSettingsDefaults(settingsSchema)
    : null;
  const settingsTableName = `${tableName}_settings`;
  const customColNames = summaryColumns.map(c => c.name);
  // WHY: Map column name → default value for use when upsert receives undefined.
  // Includes both common and custom columns.
  const COMMON_DEFAULTS = { latest_ran_at: '', run_count: 0, category: '', product_id: '' };
  const colDefaults = new Map(Object.entries(COMMON_DEFAULTS));
  for (const c of summaryColumns) {
    const d = c.default || '';
    // Strip SQL string quotes: "'[]'" → "[]"
    const stripped = (typeof d === 'string' && d.startsWith("'") && d.endsWith("'"))
      ? d.slice(1, -1) : d;
    colDefaults.set(c.name, stripped);
  }

  // ── Prepare statements ──────────────────────────────────────────

  const allSummaryCols = ['category', 'product_id', ...customColNames, 'latest_ran_at', 'run_count'];
  const placeholders = allSummaryCols.map(() => '?').join(', ');
  const updateSet = allSummaryCols
    .filter(c => c !== 'category' && c !== 'product_id')
    .map(c => `${c} = excluded.${c}`)
    .join(', ');

  const stmts = {
    _upsert: db.prepare(
      `INSERT INTO ${tableName} (${allSummaryCols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(category, product_id) DO UPDATE SET ${updateSet}`
    ),
    _get: db.prepare(
      `SELECT * FROM ${tableName} WHERE category = ? AND product_id = ?`
    ),
    _list: db.prepare(
      `SELECT * FROM ${tableName} WHERE category = ? ORDER BY product_id`
    ),
    _remove: db.prepare(
      `DELETE FROM ${tableName} WHERE category = ? AND product_id = ?`
    ),
    // WHY: Opt-in cooldown query for modules that declare a cooldown_until column.
    // Returns the summary row only if its cooldown is still in the future.
    ...(customColNames.includes('cooldown_until') ? {
      _getIfOnCooldown: db.prepare(
        `SELECT * FROM ${tableName}
         WHERE category = ? AND product_id = ? AND cooldown_until > ?`
      ),
    } : {}),
    _insertRun: db.prepare(
      `INSERT OR REPLACE INTO ${runsTableName} (category, product_id, run_number, ran_at, model, fallback_used, effort_level, access_mode, thinking, web_search, selected_json, prompt_json, response_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    _listRuns: db.prepare(
      `SELECT * FROM ${runsTableName} WHERE category = ? AND product_id = ? ORDER BY run_number ASC`
    ),
    _getLatestRun: db.prepare(
      `SELECT * FROM ${runsTableName} WHERE category = ? AND product_id = ? ORDER BY run_number DESC LIMIT 1`
    ),
    _removeRun: db.prepare(
      `DELETE FROM ${runsTableName} WHERE category = ? AND product_id = ? AND run_number = ?`
    ),
    _removeAllRuns: db.prepare(
      `DELETE FROM ${runsTableName} WHERE category = ? AND product_id = ?`
    ),
    // WHY: Targeted bookkeeping-only update — preserves custom columns.
    // Used by DELETE run handlers to avoid nuking colors/editions.
    _updateBookkeeping: db.prepare(
      `UPDATE ${tableName} SET latest_ran_at = ?, run_count = ?
       WHERE category = ? AND product_id = ?`
    ),
    // Settings statements (only if module declares settingsDefaults)
    ...(settingsDefaults ? {
      _getSetting: db.prepare(`SELECT value FROM ${settingsTableName} WHERE key = ?`),
      _upsertSetting: db.prepare(
        `INSERT INTO ${settingsTableName} (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ),
      _allSettings: db.prepare(`SELECT key, value FROM ${settingsTableName}`),
      _deleteSetting: db.prepare(`DELETE FROM ${settingsTableName} WHERE key = ?`),
    } : {}),
  };

  // ── Summary methods ─────────────────────────────────────────────

  function serializeSummaryValue(value, colName) {
    if (value === null || value === undefined) {
      // WHY: Use the manifest's declared default for custom columns,
      // '' for common columns. Preserves SQL default behavior on minimal upsert.
      return colDefaults.get(colName) ?? '';
    }
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  function upsert(row) {
    const values = allSummaryCols.map(col => {
      const v = row[col];
      return serializeSummaryValue(v, col);
    });
    stmts._upsert.run(...values);
  }

  function hydrateSummaryRow(row) {
    if (!row) return null;
    const result = { ...row };
    // WHY: JSON array columns need parsing on read
    for (const col of customColNames) {
      const val = row[col];
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        result[col] = safeJsonParse(val, val);
      }
    }
    return result;
  }

  function get(productId) {
    const row = stmts._get.get(category, productId);
    return row ? hydrateSummaryRow(row) : null;
  }

  function listByCategory(cat) {
    return stmts._list.all(cat || category).map(hydrateSummaryRow);
  }

  function remove(productId) {
    stmts._remove.run(category, productId);
  }

  // ── Cooldown (opt-in) ───────────────────────────────────────────
  // WHY: Only provided when module declares a cooldown_until column.
  // Returns the row only if the stored cooldown_until is still in the future.
  function getIfOnCooldown(productId) {
    if (!stmts._getIfOnCooldown) return null;
    const now = new Date().toISOString();
    const row = stmts._getIfOnCooldown.get(category, productId, now);
    return row ? hydrateSummaryRow(row) : null;
  }

  // ── Run methods ─────────────────────────────────────────────────

  function insertRun(row) {
    stmts._insertRun.run(
      row.category || category,
      row.product_id,
      row.run_number,
      row.ran_at || '',
      row.model || 'unknown',
      row.fallback_used ? 1 : 0,
      row.effort_level || '',
      row.access_mode || '',
      row.thinking ? 1 : 0,
      row.web_search ? 1 : 0,
      JSON.stringify(row.selected || {}),
      JSON.stringify(row.prompt || {}),
      JSON.stringify(row.response || {}),
    );
  }

  function listRuns(productId) {
    return stmts._listRuns.all(category, productId).map(hydrateRunRow);
  }

  function getLatestRun(productId) {
    return hydrateRunRow(stmts._getLatestRun.get(category, productId));
  }

  function removeRun(productId, runNumber) {
    stmts._removeRun.run(category, productId, runNumber);
  }

  function removeAllRuns(productId) {
    stmts._removeAllRuns.run(category, productId);
  }

  // ── Settings methods (per-category key-value) ──────────────────
  // WHY: Falls back to settingsDefaults from the module manifest when
  // a key has no DB row. This means freshly-created categories get
  // sensible defaults without explicit seeding.

  function getSetting(key) {
    if (!stmts._getSetting) return settingsDefaults?.[key] ?? '';
    const row = stmts._getSetting.get(key);
    return row ? row.value : (settingsDefaults?.[key] ?? '');
  }

  function setSetting(key, value) {
    if (!stmts._upsertSetting) return;
    stmts._upsertSetting.run(key, String(value));
  }

  function getAllSettings() {
    const defaults = { ...(settingsDefaults || {}) };
    if (!stmts._allSettings) return defaults;
    for (const row of stmts._allSettings.all()) {
      defaults[row.key] = row.value;
    }
    return defaults;
  }

  function deleteSetting(key) {
    if (!stmts._deleteSetting) return;
    stmts._deleteSetting.run(key);
  }

  // WHY: Targeted single-column update for lightweight writes (e.g. carousel_slots).
  // Avoids full upsert which would require supplying every column.
  function updateSummaryField(productId, field, value) {
    if (!customColNames.includes(field)) return;
    db.prepare(`UPDATE ${tableName} SET ${field} = ? WHERE category = ? AND product_id = ?`).run(value, category, productId);
  }

  // WHY: After run deletion, only bookkeeping columns (ran_at, count)
  // need updating. Full upsert would nuke custom columns (colors, editions)
  // by overwriting them with empty defaults.
  function updateBookkeeping(productId, { latest_ran_at, run_count }) {
    stmts._updateBookkeeping.run(
      latest_ran_at ?? '', run_count ?? 0,
      category, productId,
    );
  }

  return {
    upsert, get, listByCategory, remove,
    getIfOnCooldown,
    insertRun, listRuns, getLatestRun, removeRun, removeAllRuns,
    getSetting, setSetting, getAllSettings, deleteSetting,
    updateSummaryField, updateBookkeeping,
  };
}
