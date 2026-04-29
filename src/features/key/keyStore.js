/**
 * Key Finder — JSON store wrapper + SQL rebuild.
 *
 * Durable SSOT: `.workspace/products/{pid}/key_finder.json` (selected.keys[fk] map).
 * SQL projections: `key_finder` (summary) + `key_finder_runs` (per-run) — both
 * rebuildable from JSON alone per the Rebuild Contract.
 */

import fs from 'node:fs';
import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { isUnknownSentinel } from '../../shared/valueNormalizers.js';

export const keyFinderStore = createFinderJsonStore({
  filePrefix: 'key_finder',
  emptySelected: () => ({ keys: {} }),
});

export const readKeyFinder = keyFinderStore.read;
export const writeKeyFinder = keyFinderStore.write;
export const mergeKeyFinderDiscovery = keyFinderStore.merge;
export const deleteKeyFinderRun = keyFinderStore.deleteRun;
export const deleteKeyFinderRuns = keyFinderStore.deleteRuns;
export const deleteKeyFinderAll = keyFinderStore.deleteAll;

function keyFinderSqlStore(specDb) {
  const store = specDb?.getFinderStore?.('keyFinder') ?? null;
  return store && typeof store === 'object' ? store : null;
}

function canReadSqlRuns(store) {
  return typeof store?.listRuns === 'function';
}

function canReadSqlSummaryRuns(store) {
  return typeof store?.listRunsForSummary === 'function';
}

function canWriteSqlRuns(store) {
  return canReadSqlRuns(store)
    && typeof store.insertRun === 'function'
    && typeof store.upsert === 'function';
}

function sortRuns(runs) {
  return [...(Array.isArray(runs) ? runs : [])]
    .sort((a, b) => (Number(a?.run_number) || 0) - (Number(b?.run_number) || 0));
}

function maxRunNumber(runs) {
  return sortRuns(runs).reduce((max, run) => Math.max(max, Number(run?.run_number) || 0), 0);
}

// WHY: Run Group/All can overlap multiple keys for the same product. Reserve
// numbers before the LLM call so publisher source ids and history rows cannot
// collide while calls are still in flight.
const reservedRunNumberByProduct = new Map();

function reservationKey({ category, productId, specDb }) {
  return `${category || specDb?.category || ''}\u0000${productId}`;
}

function latestRun(runs) {
  const sorted = sortRuns(runs);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

function buildRunEntry({ runNumber, ranAt, run }) {
  return {
    run_number: runNumber,
    ran_at: ranAt || new Date().toISOString(),
    model: run.model || 'unknown',
    fallback_used: Boolean(run.fallback_used),
    ...(run.status ? { status: run.status } : {}),
    ...(run.mode ? { mode: run.mode } : {}),
    ...(run.loop_id ? { loop_id: run.loop_id } : {}),
    ...(run.started_at ? { started_at: run.started_at } : {}),
    ...(run.duration_ms != null ? { duration_ms: run.duration_ms } : {}),
    ...(run.access_mode ? { access_mode: run.access_mode } : {}),
    ...(run.effort_level ? { effort_level: run.effort_level } : {}),
    ...(run.thinking != null ? { thinking: Boolean(run.thinking) } : {}),
    ...(run.web_search != null ? { web_search: Boolean(run.web_search) } : {}),
    selected: run.selected || { keys: {} },
    prompt: run.prompt || { system: '', user: '' },
    response: run.response || { keys: {} },
  };
}

function upsertSqlSummary({ store, category, productId, runs }) {
  const sorted = sortRuns(runs);
  const latest = latestRun(sorted);
  store.upsert({
    category,
    product_id: productId,
    last_run_id: latest ? (Number(latest.run_number) || 0) : 0,
    cooldown_until: '',
    latest_ran_at: latest?.ran_at || '',
    run_count: sorted.length,
  });
}

function insertSqlRun({ store, category, productId, run }) {
  store.insertRun({
    category,
    product_id: productId,
    run_number: run.run_number,
    ran_at: run.ran_at,
    started_at: run.started_at ?? null,
    duration_ms: run.duration_ms ?? null,
    model: run.model || 'unknown',
    fallback_used: Boolean(run.fallback_used),
    effort_level: run.effort_level || '',
    access_mode: run.access_mode || '',
    thinking: Boolean(run.thinking),
    web_search: Boolean(run.web_search),
    selected: run.selected || { keys: {} },
    prompt: run.prompt || {},
    response: run.response || {},
  });
}

export function listKeyFinderRuntimeRuns({ specDb, productId, productRoot }) {
  const store = keyFinderSqlStore(specDb);
  if (canReadSqlRuns(store)) {
    const runs = sortRuns(store.listRuns(productId));
    const summary = typeof store.get === 'function' ? store.get(productId) : null;
    if (runs.length > 0 || summary) return runs;
  }
  const doc = readKeyFinder({ productId, productRoot });
  return sortRuns(doc?.runs || []);
}

export function readKeyFinderRuntimeDoc({ specDb, productId, productRoot, category }) {
  const store = keyFinderSqlStore(specDb);
  if (canReadSqlRuns(store)) {
    const runs = sortRuns(store.listRuns(productId));
    const summary = typeof store.get === 'function' ? store.get(productId) : null;
    if (runs.length > 0 || summary) {
      const existing = readKeyFinder({ productId, productRoot });
      return keyFinderStore.recalculateFromRuns(
        runs,
        productId,
        summary?.category || category || specDb?.category || existing?.category || '',
        existing,
      );
    }
  }
  return readKeyFinder({ productId, productRoot });
}

export function readKeyFinderRuntimeSummaryDoc({ specDb, productId, productRoot, category }) {
  const store = keyFinderSqlStore(specDb);
  if (canReadSqlSummaryRuns(store)) {
    const runs = sortRuns(store.listRunsForSummary(productId));
    const summary = typeof store.get === 'function' ? store.get(productId) : null;
    if (runs.length > 0 || summary) {
      const latest = latestRun(runs);
      const runCount = Number.isFinite(Number(summary?.run_count))
        ? Number(summary.run_count)
        : runs.length;
      return {
        product_id: productId,
        category: summary?.category || category || specDb?.category || latest?.category || '',
        selected: { keys: {} },
        last_ran_at: summary?.latest_ran_at || latest?.ran_at || '',
        run_count: runCount,
        next_run_number: maxRunNumber(runs) + 1,
        runs,
      };
    }
  }
  return readKeyFinderRuntimeDoc({ specDb, productId, productRoot, category });
}

export function listKeyFinderRuntimeSummaries({ specDb, category, productRoot }) {
  const store = keyFinderSqlStore(specDb);
  if (typeof store?.listByCategory === 'function') {
    const rows = store.listByCategory(category).map((row) => ({
      product_id: row.product_id,
      category: row.category,
      run_count: row.run_count || 0,
      last_ran_at: row.latest_ran_at || '',
    }));
    if (rows.length > 0) return rows;
  }

  const summaries = [];
  let entries;
  try {
    entries = fs.readdirSync(productRoot, { withFileTypes: true });
  } catch {
    return summaries;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const doc = readKeyFinder({ productId: entry.name, productRoot });
    if (!doc || doc.category !== category) continue;
    summaries.push({
      product_id: doc.product_id,
      category: doc.category,
      run_count: doc.run_count || (doc.runs?.length || 0),
      last_ran_at: doc.last_ran_at || '',
    });
  }
  return summaries;
}

export function nextKeyFinderRunNumber({ specDb, productId, productRoot, previousRuns = null }) {
  const store = keyFinderSqlStore(specDb);
  if (canReadSqlRuns(store)) {
    const runs = Array.isArray(previousRuns) ? previousRuns : store.listRuns(productId);
    const summary = typeof store.get === 'function' ? store.get(productId) : null;
    if (runs.length > 0 || summary) return maxRunNumber(runs) + 1;
  }

  const doc = readKeyFinder({ productId, productRoot });
  if (Number.isInteger(doc?.next_run_number) && doc.next_run_number > 0) return doc.next_run_number;
  const runs = Array.isArray(previousRuns) ? previousRuns : (doc?.runs || []);
  return maxRunNumber(runs) + 1;
}

export function reserveKeyFinderRunNumber({
  specDb,
  productId,
  productRoot,
  category,
  previousRuns = null,
}) {
  const observedNext = nextKeyFinderRunNumber({ specDb, productId, productRoot, previousRuns });
  const key = reservationKey({ category, productId, specDb });
  const reservedMax = reservedRunNumberByProduct.get(key) || 0;
  const reserved = Math.max(observedNext, reservedMax + 1);
  reservedRunNumberByProduct.set(key, reserved);
  return reserved;
}

export function writeKeyFinderJsonMirrorFromSql({ specDb, productId, productRoot, category }) {
  const store = keyFinderSqlStore(specDb);
  if (!canReadSqlRuns(store)) return readKeyFinder({ productId, productRoot });
  const runs = sortRuns(store.listRuns(productId));
  const existing = readKeyFinder({ productId, productRoot });
  const doc = keyFinderStore.recalculateFromRuns(runs, productId, category || specDb?.category || existing?.category || '', existing);
  keyFinderStore.write({ productId, productRoot, data: doc });
  return doc;
}

export function persistKeyFinderRunSqlFirst({
  specDb,
  productId,
  productRoot,
  category,
  run,
  ranAt,
  runNumber,
}) {
  const store = keyFinderSqlStore(specDb);
  if (!canWriteSqlRuns(store)) {
    const merged = mergeKeyFinderDiscovery({
      productId,
      productRoot,
      newDiscovery: { category, last_ran_at: ranAt },
      run,
    });
    const latest = latestRun(merged.runs);
    return { runNumber: latest?.run_number || 0, run: latest, doc: merged, sqlFirst: false };
  }

  let existingRuns = sortRuns(store.listRuns(productId));
  const existingSummary = typeof store.get === 'function' ? store.get(productId) : null;
  if (existingRuns.length === 0 && !existingSummary) {
    const existingDoc = readKeyFinder({ productId, productRoot });
    const jsonRuns = sortRuns(existingDoc?.runs || []);
    if (jsonRuns.length > 0) {
      for (const jsonRun of jsonRuns) {
        insertSqlRun({ store, category, productId, run: jsonRun });
      }
      existingRuns = jsonRuns;
      upsertSqlSummary({ store, category, productId, runs: existingRuns });
    }
  }
  const nextRunNumber = Number.isInteger(runNumber) && runNumber > 0
    ? runNumber
    : maxRunNumber(existingRuns) + 1;
  const runEntry = buildRunEntry({ runNumber: nextRunNumber, ranAt, run });
  insertSqlRun({ store, category, productId, run: runEntry });

  const runs = sortRuns([...existingRuns.filter((r) => r.run_number !== nextRunNumber), runEntry]);
  upsertSqlSummary({ store, category, productId, runs });
  const doc = writeKeyFinderJsonMirrorFromSql({ specDb, productId, productRoot, category });
  return { runNumber: nextRunNumber, run: runEntry, doc, sqlFirst: true };
}

export function deleteKeyFinderRunSqlFirst({ specDb, productId, productRoot, category, runNumber }) {
  const store = keyFinderSqlStore(specDb);
  if (!canReadSqlRuns(store) || typeof store.removeRun !== 'function' || typeof store.upsert !== 'function') {
    const updated = deleteKeyFinderRun({ productId, productRoot, runNumber });
    if (typeof specDb?.deleteFinderRun === 'function') {
      specDb.deleteFinderRun('keyFinder', productId, runNumber);
    }
    return { updated, targetRun: (updated?.runs || []).find((r) => r.run_number === runNumber) || null, sqlFirst: false };
  }

  const before = sortRuns(store.listRuns(productId));
  const targetRun = before.find((r) => r.run_number === runNumber) || null;
  store.removeRun(productId, runNumber);
  const after = sortRuns(store.listRuns(productId));
  upsertSqlSummary({ store, category, productId, runs: after });
  const updated = writeKeyFinderJsonMirrorFromSql({ specDb, productId, productRoot, category });
  return { updated, targetRun, sqlFirst: true };
}

export function deleteKeyFinderAllSqlFirst({ specDb, productId, productRoot, category }) {
  const store = keyFinderSqlStore(specDb);
  if (!canReadSqlRuns(store) || typeof store.removeAllRuns !== 'function' || typeof store.upsert !== 'function') {
    const updated = deleteKeyFinderAll({ productId, productRoot });
    if (typeof specDb?.deleteFinderAll === 'function') {
      specDb.deleteFinderAll('keyFinder', productId);
    }
    return { updated, runs: [], sqlFirst: false };
  }

  const runs = sortRuns(store.listRuns(productId));
  store.removeAllRuns(productId);
  upsertSqlSummary({ store, category, productId, runs: [] });
  const updated = writeKeyFinderJsonMirrorFromSql({ specDb, productId, productRoot, category });
  return { updated, runs, sqlFirst: true };
}

export function scrubFieldFromKeyFinderSqlFirst({ specDb, productId, productRoot, category, fieldKey }) {
  const store = keyFinderSqlStore(specDb);
  if (!canReadSqlRuns(store) || typeof store.removeRun !== 'function' || typeof store.updateRunJson !== 'function' || typeof store.upsert !== 'function') {
    const result = scrubFieldFromKeyFinder({ productId, productRoot, fieldKey });
    if (result.deletedRuns?.length > 0 && typeof specDb?.deleteFinderRun === 'function') {
      for (const deletedRun of result.deletedRuns) {
        specDb.deleteFinderRun('keyFinder', productId, deletedRun);
      }
    }
    return result;
  }

  const runs = sortRuns(store.listRuns(productId));
  const deletedRuns = [];
  let touched = false;
  for (const run of runs) {
    if (run?.response?.primary_field_key === fieldKey) {
      deletedRuns.push(run.run_number);
      store.removeRun(productId, run.run_number);
      touched = true;
      continue;
    }

    const selected = run.selected && typeof run.selected === 'object'
      ? { ...run.selected, keys: { ...(run.selected.keys || {}) } }
      : { keys: {} };
    const response = run.response && typeof run.response === 'object'
      ? { ...run.response, results: { ...(run.response.results || {}) } }
      : {};
    const hadSelected = Object.prototype.hasOwnProperty.call(selected.keys || {}, fieldKey);
    const hadResult = Object.prototype.hasOwnProperty.call(response.results || {}, fieldKey);
    if (!hadSelected && !hadResult) continue;

    delete selected.keys[fieldKey];
    delete response.results[fieldKey];
    store.updateRunJson(productId, run.run_number, { selected, response });
    touched = true;
  }

  if (!touched) return { scrubbed: false, deletedRuns: [] };

  const remaining = sortRuns(store.listRuns(productId));
  upsertSqlSummary({ store, category, productId, runs: remaining });
  writeKeyFinderJsonMirrorFromSql({ specDb, productId, productRoot, category });
  return { scrubbed: true, deletedRuns };
}

function normalizeUnknownPerKeyForStorage(perKey) {
  if (!perKey || typeof perKey !== 'object') return perKey;
  if (!isUnknownSentinel(perKey.value)) return perKey;
  return { ...perKey, value: null };
}

function normalizeUnknownKeyMapForStorage(keyMap) {
  if (!keyMap || typeof keyMap !== 'object') return keyMap;
  return Object.fromEntries(
    Object.entries(keyMap).map(([fieldKey, perKey]) => [fieldKey, normalizeUnknownPerKeyForStorage(perKey)]),
  );
}

function normalizeUnknownRunForStorage(run) {
  if (!run || typeof run !== 'object') return run;
  return {
    ...run,
    selected: run.selected && typeof run.selected === 'object'
      ? { ...run.selected, keys: normalizeUnknownKeyMapForStorage(run.selected.keys) }
      : run.selected,
    response: run.response && typeof run.response === 'object'
      ? { ...run.response, results: normalizeUnknownKeyMapForStorage(run.response.results) }
      : run.response,
  };
}

/**
 * Clear the currently-selected value for a single key. Mirrors
 * clearPublishedField's JSON half for the keyFinder JSON store. Leaves runs,
 * discovery_log, and every other doc field untouched — only removes
 * doc.selected.keys[fieldKey]. Idempotent: missing entry → no-op.
 */
export function unselectKeyFinderField({ productId, productRoot, fieldKey }) {
  const doc = keyFinderStore.read({ productId, productRoot });
  if (!doc?.selected?.keys?.[fieldKey]) return { cleared: false };
  delete doc.selected.keys[fieldKey];
  keyFinderStore.write({ productId, productRoot, data: doc });
  return { cleared: true };
}

/**
 * Wipe every trace of one field_key from the keyFinder JSON. This is the
 * "fresh slate" operation that backs the KeyRow Delete button:
 *   - Runs where the key was the PRIMARY are deleted entirely. Their run-level
 *     discovery_log (URLs checked / queries run) is attributed to that primary
 *     key by the history drawer, so it must go with the key — without this,
 *     the Discovery History count for the deleted key would stay non-zero.
 *   - Runs where the key rode only as a PASSENGER are kept: their discovery
 *     log belongs to their own primary. We just delete the passenger's
 *     selected and results entries so no orphan data survives.
 *   - Returns `{ scrubbed, deletedRuns }` so the route can cascade SQL row
 *     deletes for each deleted run.
 *
 * Idempotent — missing doc / empty runs → no-op.
 */
export function scrubFieldFromKeyFinder({ productId, productRoot, fieldKey }) {
  const doc = keyFinderStore.read({ productId, productRoot });
  if (!doc) return { scrubbed: false, deletedRuns: [] };

  const deletedRuns = [];
  const remaining = [];
  for (const run of doc.runs || []) {
    if (run?.response?.primary_field_key === fieldKey) {
      deletedRuns.push(run.run_number);
      continue;
    }
    if (run.selected?.keys) delete run.selected.keys[fieldKey];
    if (run.response?.results) delete run.response.results[fieldKey];
    remaining.push(run);
  }

  doc.runs = remaining;
  doc.run_count = remaining.length;
  // Rebuild top-level selected from the latest remaining run (latest-run-wins
  // per keyFinder semantics). Empty fallback when all runs were primary for
  // this key. Defensive: also strip fieldKey from the new selected in case a
  // passenger-only run still carried it.
  if (remaining.length > 0) {
    const latest = remaining[remaining.length - 1];
    doc.selected = latest.selected ? { ...latest.selected, keys: { ...(latest.selected.keys || {}) } } : { keys: {} };
  } else {
    doc.selected = { keys: {} };
  }
  if (doc.selected?.keys) delete doc.selected.keys[fieldKey];
  doc.last_ran_at = remaining.length > 0 ? (remaining[remaining.length - 1].ran_at || '') : '';

  keyFinderStore.write({ productId, productRoot, data: doc });
  return { scrubbed: true, deletedRuns };
}

/**
 * Per-run scrub: delete ONE keyFinder run by number, but only if its
 * primary_field_key matches fieldKey. Used by Gate 1 inconsistency purge so a
 * hallucinating LLM's primary run (queries + URLs + discovery_log) goes away
 * without disturbing unrelated runs. Passenger runs are left intact — the
 * caller already deleted the candidate row + its evidence, and the run's
 * discovery_log still belongs to its own primary field.
 *
 * Returns `{ scrubbed, deletedRun?, wasPassenger? }`. Never throws on missing
 * doc / missing run — returns a falsy scrubbed flag instead.
 *
 * @param {{ productId: string, productRoot?: string, fieldKey: string, runNumber: number }} opts
 */
export function scrubKeyFinderRunIfPrimary({ productId, productRoot, fieldKey, runNumber }) {
  if (!productId || !fieldKey || !Number.isInteger(runNumber) || runNumber < 0) {
    return { scrubbed: false };
  }
  const doc = keyFinderStore.read({ productId, productRoot });
  if (!doc) return { scrubbed: false };
  const run = (doc.runs || []).find((r) => r?.run_number === runNumber);
  if (!run) return { scrubbed: false };

  if (run.response?.primary_field_key !== fieldKey) {
    return { scrubbed: false, wasPassenger: true };
  }

  keyFinderStore.deleteRun({ productId, productRoot, runNumber });
  return { scrubbed: true, deletedRun: runNumber };
}

/**
 * Rebuild the key_finder + key_finder_runs SQL tables from per-product JSON
 * files. Called when the SQLite file is deleted to satisfy the Rebuild Contract
 * (CLAUDE.md §Dual-State Architecture). JSON remains the SSOT.
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number, runs_seeded: number }}
 */
export function rebuildKeyFinderFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0, runs_seeded: 0 };

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  const store = specDb.getFinderStore('keyFinder');
  if (!store) return stats;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const data = readKeyFinder({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    const runs = Array.isArray(data.runs) ? data.runs : [];
    const lastRunNumber = runs.length > 0 ? Math.max(...runs.map((r) => Number(r.run_number) || 0)) : 0;

    store.upsert({
      category: data.category,
      product_id: productId,
      last_run_id: lastRunNumber,
      cooldown_until: data.cooldown_until || '',
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || runs.length,
    });

    if (typeof store.removeAllRuns === 'function') {
      store.removeAllRuns(productId);
    }
    for (const rawRun of runs) {
      const run = normalizeUnknownRunForStorage(rawRun);
      store.insertRun({
        category: data.category,
        product_id: productId,
        run_number: run.run_number,
        ran_at: run.ran_at,
        started_at: run.started_at ?? run.response?.started_at ?? null,
        duration_ms: run.duration_ms ?? run.response?.duration_ms ?? null,
        model: run.model || 'unknown',
        fallback_used: Boolean(run.fallback_used),
        effort_level: run.effort_level || '',
        access_mode: run.access_mode || '',
        thinking: Boolean(run.thinking),
        web_search: Boolean(run.web_search),
        selected: run.selected || { keys: {} },
        prompt: run.prompt || {},
        response: run.response || {},
      });
    }
    stats.runs_seeded += runs.length;
    stats.seeded++;
  }

  return stats;
}
