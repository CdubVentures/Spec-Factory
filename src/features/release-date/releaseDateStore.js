/**
 * Release Date Finder — JSON store (factory-driven) + SQL rebuild.
 *
 * Store API comes from the shared `createScalarFinderStore` factory with the
 * `latestWinsPerVariant` recalc strategy. Only `rebuildReleaseDateFinderFromJson`
 * stays bespoke — SQL projection shape is per-finder.
 *
 * Durable SSOT: `.workspace/products/{pid}/release_date.json`
 *
 * Exports (names preserved — external consumers depend on them).
 */

import fs from 'node:fs';
import { createScalarFinderStore } from '../../core/finder/createScalarFinderStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

// WHY: `releaseDateFinderStore` is the generic-named factory output consumed by
// `registerScalarFinder` (it needs `.read` / `.merge` etc.). The domain-named
// aliases below (`readReleaseDates`, ...) are the historical external surface —
// external callers (tests, route handlers) keep working against these.
export const releaseDateFinderStore = createScalarFinderStore({ filePrefix: 'release_date' });

export const readReleaseDates = releaseDateFinderStore.read;
export const writeReleaseDates = releaseDateFinderStore.write;
export const mergeReleaseDateDiscovery = releaseDateFinderStore.merge;
export const deleteReleaseDateFinderRun = releaseDateFinderStore.deleteRun;
export const deleteReleaseDateFinderRuns = releaseDateFinderStore.deleteRuns;
export const deleteReleaseDateFinderAll = releaseDateFinderStore.deleteAll;
export const recalculateReleaseDatesFromRuns = releaseDateFinderStore.recalculateFromRuns;

/**
 * Rebuild the release_date_finder SQL table from per-product JSON files.
 * Called on DB delete to satisfy the CLAUDE.md rebuild contract.
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number, runs_seeded: number }}
 */
export function rebuildReleaseDateFinderFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0, runs_seeded: 0 };

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const data = readReleaseDates({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    const candidates = data.selected?.candidates || [];

    const finderStore = specDb.getFinderStore('releaseDateFinder');
    finderStore.upsert({
      category: data.category,
      product_id: productId,
      candidates,
      candidate_count: candidates.length,
      cooldown_until: data.cooldown_until || '',
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || 0,
    });

    const runs = Array.isArray(data.runs) ? data.runs : [];
    if (typeof finderStore.removeAllRuns === 'function') {
      finderStore.removeAllRuns(productId);
    }
    for (const run of runs) {
      finderStore.insertRun({
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
        selected: run.selected || {},
        prompt: run.prompt || {},
        response: run.response || {},
      });
    }
    stats.runs_seeded += runs.length;
    stats.seeded++;
  }

  return stats;
}
