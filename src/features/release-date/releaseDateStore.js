/**
 * Release Date Finder — JSON store wrapper.
 *
 * Uses the generic finderJsonStore with a latest-wins-per-variant recalculation:
 * for each variant_id (or variant_key if no id), the newest non-rejected run's
 * candidate replaces any older one. Other variants are preserved.
 *
 * `rebuildReleaseDateFinderFromJson` mirrors the per-category JSON → SQL
 * projection (matches PIF / CEF pattern).
 *
 * Durable SSOT: `.workspace/products/{pid}/release_date.json`
 */

import fs from 'node:fs';
import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

const store = createFinderJsonStore({
  filePrefix: 'release_date',
  emptySelected: () => ({ candidates: [] }),
  // WHY: Override recalculateFromRuns so the `candidates` array contains
  // exactly one entry per variant — the newest non-rejected run's candidate.
  // Keying on variant_id (falls back to variant_key) so variant renames
  // survive without orphaning prior candidates.
  recalculateSelected: (runs) => {
    const latestByKey = new Map();
    const sorted = [...runs]
      .filter(r => r.status !== 'rejected')
      .sort((a, b) => a.run_number - b.run_number);

    for (const run of sorted) {
      for (const cand of (run.selected?.candidates || [])) {
        const key = cand.variant_id || cand.variant_key || '';
        if (!key) continue;
        latestByKey.set(key, cand);
      }
    }

    return { candidates: [...latestByKey.values()] };
  },
});

export const readReleaseDates = store.read;
export const writeReleaseDates = store.write;
export const mergeReleaseDateDiscovery = store.merge;
export const deleteReleaseDateFinderRun = store.deleteRun;
export const deleteReleaseDateFinderRuns = store.deleteRuns;
export const deleteReleaseDateFinderAll = store.deleteAll;
export const recalculateReleaseDatesFromRuns = store.recalculateFromRuns;

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

    specDb.getFinderStore('releaseDateFinder').upsert({
      category: data.category,
      product_id: productId,
      candidates,
      candidate_count: candidates.length,
      cooldown_until: data.cooldown_until || '',
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || 0,
    });

    const runs = Array.isArray(data.runs) ? data.runs : [];
    for (const run of runs) {
      specDb.getFinderStore('releaseDateFinder').insertRun({
        category: data.category,
        product_id: productId,
        run_number: run.run_number,
        ran_at: run.ran_at || '',
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
