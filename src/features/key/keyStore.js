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

    for (const run of runs) {
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
