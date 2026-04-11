/**
 * Color & Edition Finder — per-product JSON store (thin wrapper).
 *
 * Delegates to the generic finder JSON store factory. The only CEF-specific
 * parts are the file prefix and the empty selected template.
 *
 * `rebuildColorEditionFinderFromJson` stays here because it knows CEF-specific
 * column mapping and specDb method names.
 */

import fs from 'node:fs';
import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

const store = createFinderJsonStore({
  filePrefix: 'color_edition',
  emptySelected: () => ({ colors: [], editions: {}, default_color: '' }),
});

export const readColorEdition = store.read;
export const writeColorEdition = store.write;
export const recalculateCumulativeFromRuns = store.recalculateFromRuns;
export const mergeColorEditionDiscovery = store.merge;
export const deleteColorEditionFinderRun = store.deleteRun;
export const deleteColorEditionFinderAll = store.deleteAll;

/**
 * Rebuild the color_edition_finder SQL table from per-product JSON files.
 * Handles both new format (selected.colors) and legacy format (colors as object keys).
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance with upsertColorEditionFinder
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number }}
 */
export function rebuildColorEditionFinderFromJson({ specDb, productRoot }) {
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

    const data = readColorEdition({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    // Handle new format (selected.colors) and legacy format (colors as object keys)
    const colors = data.selected?.colors
      ? data.selected.colors
      : (data.colors ? Object.keys(data.colors) : []);

    const editions = data.selected?.editions
      ? Object.keys(data.selected.editions)
      : (data.editions ? Object.keys(data.editions) : []);

    const defaultColor = data.selected?.default_color
      || data.default_color
      || '';

    const productId = data.product_id || entry.name;

    specDb.upsertColorEditionFinder({
      category: data.category,
      product_id: productId,
      colors,
      editions,
      default_color: defaultColor,
      cooldown_until: data.cooldown_until || '',
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || 0,
    });

    // Seed per-run history into SQL projection
    const runs = Array.isArray(data.runs) ? data.runs : [];
    for (const run of runs) {
      specDb.insertColorEditionFinderRun({
        category: data.category,
        product_id: productId,
        run_number: run.run_number,
        ran_at: run.ran_at || '',
        model: run.model || 'unknown',
        fallback_used: Boolean(run.fallback_used),
        cooldown_until: run.cooldown_until || '',
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
