import { SOURCE_CORPUS_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Source Intelligence store — extracted from SpecDb.
 * Owns: source_corpus, llm_cache tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createSourceIntelStore({ db, category, stmts }) {
  // --- LLM Cache ---

  function getLlmCacheEntry(key) {
    return stmts._getLlmCache.get(key) || null;
  }

  function setLlmCacheEntry(key, response, timestamp, ttl) {
    stmts._upsertLlmCache.run({
      cache_key: key,
      response: typeof response === 'string' ? response : JSON.stringify(response),
      timestamp,
      ttl
    });
  }

  function evictExpiredCache(nowMs) {
    return stmts._evictExpiredCache.run(nowMs || Date.now());
  }

  // --- Source Corpus ---

  function upsertSourceCorpusDoc(doc) {
    stmts._upsertSourceCorpus.run({
      url: doc.url || '',
      category: doc.category || '',
      host: doc.host || '',
      root_domain: doc.rootDomain || doc.root_domain || '',
      path: doc.path || '',
      title: doc.title || '',
      snippet: doc.snippet || '',
      tier: doc.tier ?? 99,
      role: doc.role || '',
      fields: JSON.stringify(doc.fields || []),
      methods: JSON.stringify(doc.methods || []),
      identity_match: doc.identity_match ? 1 : 0,
      approved_domain: doc.approved_domain ? 1 : 0,
      brand: doc.brand || '',
      model_name: doc.model || doc.model_name || '',
      variant: doc.variant || '',
      first_seen_at: doc.first_seen_at || doc.updated_at || new Date().toISOString(),
      last_seen_at: doc.last_seen_at || doc.updated_at || new Date().toISOString()
    });
  }

  function upsertSourceCorpusBatch(docs) {
    const tx = db.transaction((items) => {
      for (const doc of items) { upsertSourceCorpusDoc(doc); }
    });
    tx(docs);
  }

  function getSourceCorpusByCategory(cat) {
    const rows = hydrateRows(SOURCE_CORPUS_BOOLEAN_KEYS, db.prepare('SELECT * FROM source_corpus WHERE category = ? ORDER BY last_seen_at DESC').all(cat));
    for (const row of rows) {
      try { row.fields = JSON.parse(row.fields); } catch { row.fields = []; }
      try { row.methods = JSON.parse(row.methods); } catch { row.methods = []; }
      row.rootDomain = row.root_domain;
    }
    return rows;
  }

  function getSourceCorpusCount(cat) {
    const row = db.prepare('SELECT COUNT(*) as c FROM source_corpus WHERE category = ?').get(cat);
    return row?.c || 0;
  }

  // --- Bridge Events (transformed runtime events for GUI readers) ---

  function insertBridgeEvent(row) {
    stmts._insertBridgeEvent.run({
      run_id: row.run_id || '',
      category: row.category || '',
      product_id: row.product_id || '',
      ts: row.ts || new Date().toISOString(),
      stage: row.stage || '',
      event: row.event || '',
      payload: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload || {}),
    });
  }

  function getBridgeEventsByRunId(runId, limit = 2000) {
    const rows = stmts._getBridgeEventsByRunId.all(runId, limit);
    rows.reverse();
    return rows.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.payload); } catch { /* default {} */ }
      return { ...r, payload: parsed };
    });
  }

  // WHY: Wave 5.5 — after run-summary.json captures all events, purge the
  // per-run bridge_events rows to keep the SQLite WAL lean.
  function purgeBridgeEventsForRun(runId) {
    const token = String(runId || '').trim();
    if (!token) return 0;
    return db.prepare('DELETE FROM bridge_events WHERE run_id = ?').run(token).changes;
  }

  // WHY: Source intel removed — see dead-learning-modules-removal-plan.html

  return {
    getLlmCacheEntry,
    setLlmCacheEntry,
    evictExpiredCache,
    upsertSourceCorpusDoc,
    upsertSourceCorpusBatch,
    getSourceCorpusByCategory,
    getSourceCorpusCount,
    insertBridgeEvent,
    getBridgeEventsByRunId,
    purgeBridgeEventsForRun,
  };
}
