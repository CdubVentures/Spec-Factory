import { LIST_VALUE_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Enum/List store — extracted from SpecDb.
 * Owns: enum_lists, list_values tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createEnumListStore({ db, category, stmts }) {
  function ensureEnumList(fieldKey, source = 'known_values') {
    const key = String(fieldKey || '').trim();
    if (!key) return null;
    stmts._upsertEnumList.run({
      category,
      field_key: key,
      source: source || 'known_values',
    });
    const row = db
      .prepare('SELECT id FROM enum_lists WHERE category = ? AND field_key = ?')
      .get(category, key);
    return row?.id ?? null;
  }

  function getEnumList(fieldKey) {
    const key = String(fieldKey || '').trim();
    if (!key) return null;
    return db
      .prepare('SELECT * FROM enum_lists WHERE category = ? AND field_key = ?')
      .get(category, key) || null;
  }

  function getEnumListById(listId) {
    const id = Number(listId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return db
      .prepare('SELECT * FROM enum_lists WHERE category = ? AND id = ?')
      .get(category, id) || null;
  }

  function getAllEnumLists() {
    return db
      .prepare('SELECT * FROM enum_lists WHERE category = ? ORDER BY field_key')
      .all(category);
  }

  function upsertListValue({ fieldKey, value, normalizedValue, source, enumPolicy, acceptedCandidateId, needsReview, overridden, sourceTimestamp }) {
    const listId = ensureEnumList(fieldKey, source || 'known_values');
    stmts._upsertListValue.run({
      category,
      list_id: listId,
      field_key: fieldKey,
      value,
      normalized_value: normalizedValue ?? null,
      source: source || 'known_values',
      accepted_candidate_id: acceptedCandidateId ?? null,
      enum_policy: enumPolicy ?? null,
      needs_review: needsReview ? 1 : 0,
      overridden: overridden ? 1 : 0,
      source_timestamp: sourceTimestamp ?? null
    });
  }

  function getListValues(fieldKey) {
    return hydrateRows(LIST_VALUE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM list_values WHERE category = ? AND field_key = ?')
      .all(category, fieldKey));
  }

  function getListValueByFieldAndValue(fieldKey, value) {
    const exact = hydrateRow(LIST_VALUE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
      .get(category, fieldKey, value));
    if (exact) return exact;
    if (value == null) return null;
    return hydrateRow(LIST_VALUE_BOOLEAN_KEYS, db
      .prepare(`
        SELECT *
        FROM list_values
        WHERE category = ? AND field_key = ? AND LOWER(TRIM(value)) = LOWER(TRIM(?))
        ORDER BY id
        LIMIT 1
      `)
      .get(category, fieldKey, value)) || null;
  }

  function getListValueById(listValueId) {
    const id = Number(listValueId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return hydrateRow(LIST_VALUE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM list_values WHERE category = ? AND id = ?')
      .get(category, id)) || null;
  }

  function getAllEnumFields() {
    return db
      .prepare(`
        SELECT field_key
        FROM enum_lists
        WHERE category = ?
        UNION
        SELECT DISTINCT field_key
        FROM list_values
        WHERE category = ?
        ORDER BY field_key
      `)
      .all(category, category)
      .map(r => r.field_key);
  }

  function backfillEnumListIds() {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO enum_lists (category, field_key, source)
        SELECT DISTINCT category, field_key, 'backfill'
        FROM list_values
        WHERE field_key IS NOT NULL AND TRIM(field_key) <> ''
        ON CONFLICT(category, field_key) DO NOTHING
      `).run();

      db.prepare(`
        UPDATE list_values
        SET list_id = (
          SELECT el.id
          FROM enum_lists el
          WHERE el.category = list_values.category
            AND el.field_key = list_values.field_key
        )
        WHERE list_id IS NULL
      `).run();
    });
    tx();
  }

  function hardenListValueOwnership() {
    const listIdColumn = db
      .prepare('PRAGMA table_info(list_values)')
      .all()
      .find((row) => String(row?.name || '') === 'list_id');
    const listIdStrict = Number(listIdColumn?.notnull || 0) === 1;
    if (listIdStrict) return;

    backfillEnumListIds();

    const unresolved = Number(db.prepare(`
      SELECT COUNT(*) AS c
      FROM list_values
      WHERE list_id IS NULL
    `).get()?.c || 0);
    if (unresolved > 0) {
      throw new Error(`Cannot harden list_values.list_id: ${unresolved} rows remain without enum_lists linkage.`);
    }

    const fkState = Number(db.pragma('foreign_keys', { simple: true }) || 0);
    if (fkState) db.pragma('foreign_keys = OFF');
    try {
      const tx = db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS list_values__strict (
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
            source_timestamp TEXT,
            UNIQUE(category, field_key, value)
          );
        `);

        db.exec(`
          INSERT INTO list_values__strict (
            id,
            category,
            list_id,
            field_key,
            value,
            normalized_value,
            source,
            accepted_candidate_id,
            enum_policy,
            needs_review,
            overridden,
            created_at,
            updated_at,
            source_timestamp
          )
          SELECT
            id,
            category,
            list_id,
            field_key,
            value,
            normalized_value,
            source,
            accepted_candidate_id,
            enum_policy,
            needs_review,
            overridden,
            created_at,
            updated_at,
            source_timestamp
          FROM list_values;
        `);

        db.exec('DROP TABLE list_values;');
        db.exec('ALTER TABLE list_values__strict RENAME TO list_values;');
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_lv_field ON list_values(field_key);
          CREATE INDEX IF NOT EXISTS idx_lv_list_id ON list_values(list_id);
        `);
      });
      tx();
    } finally {
      if (fkState) db.pragma('foreign_keys = ON');
    }
  }

  function deleteListValue(fieldKey, value) {
    const tx = db.transaction(() => {
      const row = db
        .prepare('SELECT id FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
        .get(category, fieldKey, value);
      if (row?.id != null) {
        db
          .prepare('DELETE FROM item_list_links WHERE category = ? AND field_key = ? AND list_value_id = ?')
          .run(category, fieldKey, row.id);
      }
      db
        .prepare('DELETE FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
        .run(category, fieldKey, value);
    });
    tx();
  }

  function deleteListValueById(listValueId) {
    const row = getListValueById(listValueId);
    if (!row) return null;
    deleteListValue(row.field_key, row.value);
    return row;
  }

  function renameListValue(fieldKey, oldValue, newValue, timestamp) {
    const affected = new Set();
    const tx = db.transaction(() => {
      // item_field_state retired in Phase 1b — affected products from list links only

      const oldRow = db
        .prepare('SELECT id FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
        .get(category, fieldKey, oldValue);
      if (oldRow?.id != null) {
        const linkRows = db
          .prepare('SELECT DISTINCT product_id FROM item_list_links WHERE category = ? AND field_key = ? AND list_value_id = ?')
          .all(category, fieldKey, oldRow.id);
        for (const row of linkRows) {
          if (row?.product_id) affected.add(row.product_id);
        }
      }

      const normalizedNew = String(newValue).trim().toLowerCase();
      const enumListId = ensureEnumList(fieldKey, 'manual');
      stmts._upsertListValue.run({
        category,
        list_id: enumListId,
        field_key: fieldKey,
        value: newValue,
        normalized_value: normalizedNew,
        source: 'manual',
        accepted_candidate_id: null,
        enum_policy: null,
        needs_review: 0,
        overridden: 1,
        source_timestamp: timestamp || new Date().toISOString()
      });
      const newRow = db
        .prepare('SELECT id FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
        .get(category, fieldKey, newValue);

      // item_field_state UPDATE retired in Phase 1b

      if (oldRow && newRow && Number(oldRow.id) !== Number(newRow.id)) {
        db
          .prepare('UPDATE item_list_links SET list_value_id = ? WHERE category = ? AND field_key = ? AND list_value_id = ?')
          .run(newRow.id, category, fieldKey, oldRow.id);
      }
      if (oldRow && (!newRow || Number(oldRow.id) !== Number(newRow.id))) {
        db
          .prepare('DELETE FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
          .run(category, fieldKey, oldValue);
      }
    });
    tx();
    return [...affected];
  }

  function renameListValueById(listValueId, newValue, timestamp) {
    const row = getListValueById(listValueId);
    if (!row) return [];
    return renameListValue(row.field_key, row.value, newValue, timestamp);
  }

  return {
    ensureEnumList,
    getEnumList,
    getEnumListById,
    getAllEnumLists,
    upsertListValue,
    getListValues,
    getListValueByFieldAndValue,
    getListValueById,
    getAllEnumFields,
    backfillEnumListIds,
    hardenListValueOwnership,
    deleteListValue,
    deleteListValueById,
    renameListValue,
    renameListValueById,
  };
}
