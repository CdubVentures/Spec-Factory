/**
 * SKU Finder — JSON store (factory-driven) + SQL rebuild.
 *
 * Store API comes from the shared `createScalarFinderStore` factory with the
 * `latestWinsPerVariant` recalc strategy. Only `rebuildSkuFinderFromJson`
 * stays bespoke — SQL projection shape is per-finder.
 *
 * Durable SSOT: `.workspace/products/{pid}/sku.json`
 */

import fs from 'node:fs';
import { createScalarFinderStore } from '../../core/finder/createScalarFinderStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

export const skuFinderStore = createScalarFinderStore({ filePrefix: 'sku' });

export const readSkus = skuFinderStore.read;
export const writeSkus = skuFinderStore.write;
export const mergeSkuDiscovery = skuFinderStore.merge;
export const deleteSkuFinderRun = skuFinderStore.deleteRun;
export const deleteSkuFinderRuns = skuFinderStore.deleteRuns;
export const deleteSkuFinderAll = skuFinderStore.deleteAll;
export const recalculateSkusFromRuns = skuFinderStore.recalculateFromRuns;

/**
 * Rebuild the sku_finder SQL table from per-product JSON files.
 * Called on DB delete to satisfy the CLAUDE.md rebuild contract.
 *
 * @param {object} opts
 * @param {object} opts.specDb
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number, runs_seeded: number }}
 */
export function rebuildSkuFinderFromJson({ specDb, productRoot }) {
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

    const data = readSkus({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    const candidates = data.selected?.candidates || [];

    specDb.getFinderStore('skuFinder').upsert({
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
      specDb.getFinderStore('skuFinder').insertRun({
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
