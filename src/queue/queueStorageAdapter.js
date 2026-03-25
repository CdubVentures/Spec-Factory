// WHY: Unified storage adapter for queue product CRUD.
// Eliminates the dual-path `if (specDb)` pattern in queueState.js.
// Factory returns either a SQLite adapter (wrapping SpecDb) or a JSON
// adapter (wrapping storage read/write). Both return normalized JS rows.

import { nowIso, toArray } from '../shared/primitives.js';
import { toInt } from '../shared/valueNormalizers.js';

function round(value, digits = 8) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

function normalizeProductRow(productId, current = {}) {
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

// ── JSON state helpers ──────────────────────────────────────────────

function modernQueueStateKey(category) {
  return `_queue/${String(category || '').trim()}/state.json`;
}

function legacyQueueStateKey(storage, category) {
  return storage.resolveOutputKey('_queue', category, 'state.json');
}

async function readQueueJsonSafe(storage, key) {
  if (typeof storage.readTextOrNull === 'function') {
    const text = await storage.readTextOrNull(key);
    if (text == null) return { data: null, corrupt: false };
    try {
      return { data: JSON.parse(text), corrupt: false };
    } catch (error) {
      if (error instanceof SyntaxError) return { data: null, corrupt: true };
      throw error;
    }
  }
  try {
    return { data: await storage.readJsonOrNull(key), corrupt: false };
  } catch (error) {
    if (error instanceof SyntaxError) return { data: null, corrupt: true };
    throw error;
  }
}

async function loadJsonState(storage, category) {
  const key = modernQueueStateKey(category);
  const legacyKey = legacyQueueStateKey(storage, category);
  const modern = await readQueueJsonSafe(storage, key);
  const legacy = await readQueueJsonSafe(storage, legacyKey);
  const existing = modern.data || legacy.data;
  const products = {};
  for (const [productId, row] of Object.entries(existing?.products || {})) {
    products[productId] = normalizeProductRow(productId, row);
  }
  return {
    products,
    corrupt: Boolean((modern.corrupt || legacy.corrupt) && !existing),
  };
}

async function saveJsonState(storage, category, products) {
  const state = {
    category,
    updated_at: nowIso(),
    products: {},
  };
  for (const [productId, row] of Object.entries(products)) {
    state.products[productId] = normalizeProductRow(productId, row);
  }
  const key = modernQueueStateKey(category);
  const legacyKey = legacyQueueStateKey(storage, category);
  const payload = Buffer.from(JSON.stringify(state, null, 2), 'utf8');
  await storage.writeObject(key, payload, { contentType: 'application/json' });
  await storage.writeObject(legacyKey, payload, { contentType: 'application/json' });
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

    // WHY: JSON adapter tracks corrupt recovery; SQLite never has this.
    recoveredFromCorrupt: false,
  };
}

// ── JSON adapter ────────────────────────────────────────────────────

function createJsonAdapter(storage, category) {
  let cachedState = null;
  let recoveredFromCorrupt = false;

  async function ensureLoaded() {
    if (!cachedState) {
      const loaded = await loadJsonState(storage, category);
      cachedState = loaded.products;
      recoveredFromCorrupt = loaded.corrupt;
    }
    return cachedState;
  }

  async function flush() {
    if (cachedState) {
      await saveJsonState(storage, category, cachedState);
    }
  }

  return {
    async get(productId) {
      const products = await ensureLoaded();
      const row = products[productId];
      return row ? normalizeProductRow(productId, row) : null;
    },

    async getAll(statusFilter) {
      const products = await ensureLoaded();
      const rows = Object.entries(products).map(([id, row]) => normalizeProductRow(id, row));
      if (!statusFilter) return rows;
      const wanted = String(statusFilter).trim().toLowerCase();
      return rows.filter((r) => String(r.status || '').trim().toLowerCase() === wanted);
    },

    async selectNext() {
      const products = await ensureLoaded();
      const rows = Object.entries(products).map(([id, row]) => normalizeProductRow(id, row));
      // WHY: Return all eligible rows — scoring happens in queueState.js
      const eligible = rows.filter((r) =>
        !['complete', 'blocked', 'paused', 'skipped', 'in_progress', 'needs_manual', 'exhausted', 'failed'].includes(r.status)
      );
      if (!eligible.length) return null;
      eligible.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
      return eligible[0];
    },

    async save(productId, row) {
      const products = await ensureLoaded();
      products[productId] = normalizeProductRow(productId, row);
      await flush();
    },

    async patch(productId, patchData) {
      const products = await ensureLoaded();
      const existing = products[productId];
      if (!existing) return null;
      const merged = normalizeProductRow(productId, { ...existing, ...patchData });
      products[productId] = merged;
      await flush();
      return merged;
    },

    async delete(productId) {
      const products = await ensureLoaded();
      const existed = Boolean(products[productId]);
      delete products[productId];
      if (existed) await flush();
      return { changes: existed ? 1 : 0 };
    },

    async clearByStatus(status) {
      const products = await ensureLoaded();
      const wanted = String(status).trim().toLowerCase();
      const removed = [];
      for (const [id, row] of Object.entries(products)) {
        if (String(row.status || '').trim().toLowerCase() === wanted) {
          removed.push(id);
          delete products[id];
        }
      }
      if (removed.length > 0) await flush();
      return { removed_count: removed.length, removed_product_ids: removed };
    },

    async saveBatch(productsMap) {
      const products = await ensureLoaded();
      for (const [productId, row] of Object.entries(productsMap)) {
        products[productId] = normalizeProductRow(productId, row);
      }
      await flush();
    },

    get recoveredFromCorrupt() { return recoveredFromCorrupt; },
  };
}

// ── Factory ─────────────────────────────────────────────────────────

export function createQueueAdapter({ storage, category, specDb = null }) {
  return specDb
    ? createSqliteAdapter(specDb)
    : createJsonAdapter(storage, category);
}
