// WHY: Queue storage adapter — SQL-only (product_queue table via SpecDb).
// JSON adapter removed — SQL is the sole SSOT for queue state.

import { nowIso, toArray } from '../shared/primitives.js';
import { toInt } from '../shared/valueNormalizers.js';

function round(value, digits = 8) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

export function normalizeProductRow(productId, current = {}) {
  return {
    productId,
    s3key: current.s3key || '',
    status: String(current.status || 'pending'),
    priority: Math.max(1, Math.min(5, toInt(current.priority, 3))),
    attempts_total: toInt(current.attempts_total, 0),
    retry_count: toInt(current.retry_count, 0),
    max_attempts: Math.max(1, toInt(current.max_attempts, 3)),
    next_retry_at: String(current.next_retry_at || '').trim(),
    last_run_id: current.last_run_id || '',
    last_summary: current.last_summary || null,
    cost_usd_total_for_product: round(current.cost_usd_total_for_product || 0, 8),
    rounds_completed: toInt(current.rounds_completed, 0),
    next_action_hint: current.next_action_hint || '',
    last_urls_attempted: toArray(current.last_urls_attempted).slice(0, 300),
    last_error: String(current.last_error || '').trim(),
    last_failed_at: String(current.last_failed_at || '').trim(),
    last_started_at: current.last_started_at || '',
    last_completed_at: current.last_completed_at || '',
    updated_at: current.updated_at || nowIso(),
  };
}

// ── Row conversion (SQLite ↔ JS) ───────────────────────────────────

function sqliteRowToJs(row) {
  return {
    s3key: row.s3key || '',
    status: row.status || 'pending',
    priority: row.priority ?? 3,
    attempts_total: row.attempts_total ?? 0,
    retry_count: row.retry_count ?? 0,
    max_attempts: row.max_attempts ?? 3,
    next_retry_at: row.next_retry_at || '',
    last_run_id: row.last_run_id || '',
    last_summary: row.last_summary || null,
    cost_usd_total_for_product: row.cost_usd_total ?? 0,
    rounds_completed: row.rounds_completed ?? 0,
    next_action_hint: row.next_action_hint || '',
    last_urls_attempted: Array.isArray(row.last_urls_attempted) ? row.last_urls_attempted : [],
    last_error: row.last_error || '',
    last_started_at: row.last_started_at || '',
    last_completed_at: row.last_completed_at || '',
    updated_at: row.updated_at || nowIso(),
  };
}

function jsRowToSqliteUpsert(productId, row) {
  return {
    product_id: productId,
    s3key: row.s3key || '',
    status: row.status || 'pending',
    priority: row.priority ?? 3,
    attempts_total: row.attempts_total ?? 0,
    retry_count: row.retry_count ?? 0,
    max_attempts: row.max_attempts ?? 3,
    next_retry_at: row.next_retry_at || null,
    last_run_id: row.last_run_id || null,
    cost_usd_total: row.cost_usd_total_for_product ?? 0,
    rounds_completed: row.rounds_completed ?? 0,
    next_action_hint: row.next_action_hint || null,
    last_urls_attempted: row.last_urls_attempted || [],
    last_error: row.last_error || null,
    last_started_at: row.last_started_at || null,
    last_completed_at: row.last_completed_at || null,
    last_summary: row.last_summary || null,
  };
}

// ── SQLite adapter ──────────────────────────────────────────────────

function createSqliteAdapter(specDb) {
  return {
    async get(productId) {
      const row = specDb.getQueueProduct(productId);
      return row ? normalizeProductRow(row.product_id, sqliteRowToJs(row)) : null;
    },

    async getAll(statusFilter) {
      const rows = statusFilter
        ? specDb.getAllQueueProducts(statusFilter)
        : specDb.getAllQueueProducts();
      return rows.map((row) => normalizeProductRow(row.product_id, sqliteRowToJs(row)));
    },

    async selectNext() {
      const row = specDb.selectNextQueueProductSql();
      return row ? normalizeProductRow(row.product_id, sqliteRowToJs(row)) : null;
    },

    async save(productId, row) {
      specDb.upsertQueueProduct(jsRowToSqliteUpsert(productId, row));
    },

    async patch(productId, patch) {
      const result = specDb.updateQueueProductPatch(productId, patch);
      return result ? normalizeProductRow(result.product_id || productId, sqliteRowToJs(result)) : null;
    },

    async delete(productId) {
      return specDb.deleteQueueProduct(productId);
    },

    async clearByStatus(status) {
      const matching = specDb.getAllQueueProducts(status);
      const removed = matching.map((row) => row.product_id);
      if (removed.length > 0) specDb.clearQueueByStatus(status);
      return { removed_count: removed.length, removed_product_ids: removed };
    },

    async saveBatch(products) {
      const tx = specDb.db.transaction(() => {
        for (const [productId, row] of Object.entries(products)) {
          specDb.upsertQueueProduct(jsRowToSqliteUpsert(productId, row));
        }
      });
      tx();
    },

    recoveredFromCorrupt: false,
  };
}

// ── Factory ─────────────────────────────────────────────────────────

export function createQueueAdapter({ storage, category, specDb = null }) {
  if (!specDb) {
    throw new TypeError(`createQueueAdapter requires specDb for category "${category}" — JSON fallback has been removed`);
  }
  return createSqliteAdapter(specDb);
}
