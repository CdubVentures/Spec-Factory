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
