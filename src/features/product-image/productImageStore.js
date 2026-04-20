/**
 * Product Image Finder — JSON store wrapper.
 *
 * Uses the generic finderJsonStore but overrides recalculation to
 * ACCUMULATE images across variants instead of latest-wins.
 * Each variant_key's latest non-rejected run wins, but other
 * variants are preserved.
 *
 * `rebuildProductImageFinderFromJson` stays here because it knows PIF-specific
 * column mapping and specDb method names (mirrors CEF pattern).
 *
 * Durable SSOT: `.workspace/products/{pid}/product_images.json`
 */

import fs from 'node:fs';
import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';
import { extractEvalState } from './imageEvaluator.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

const store = createFinderJsonStore({
  filePrefix: 'product_images',
  emptySelected: () => ({ images: [] }),
  // WHY: Override recalculateFromRuns to accumulate ALL images across variants.
  // The generic store uses latest-wins (selected = last non-rejected run).
  // PIF needs every image from every non-rejected run — filenames are unique
  // via the -N suffix, so no dedup is needed. The carousel strategy counts
  // images per view to determine satisfaction.
  recalculateSelected: (runs) => {
    const images = [];
    const sorted = [...runs]
      .filter(r => r.status !== 'rejected')
      .sort((a, b) => a.run_number - b.run_number);

    for (const run of sorted) {
      for (const img of (run.selected?.images || [])) {
        if (img.variant_key) images.push(img);
      }
    }

    return { images };
  },
});

export const readProductImages = store.read;
export const writeProductImages = store.write;
export const mergeProductImageDiscovery = store.merge;
export const deleteProductImageFinderRun = store.deleteRun;
export const deleteProductImageFinderRuns = store.deleteRuns;
export const deleteProductImageFinderAll = store.deleteAll;
export const recalculateProductImagesFromRuns = store.recalculateFromRuns;

/**
 * Rebuild the product_image_finder SQL table from per-product JSON files.
 * Called on DB delete to satisfy the CLAUDE.md rebuild contract.
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number, runs_seeded: number }}
 */
export function rebuildProductImageFinderFromJson({ specDb, productRoot }) {
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

    const data = readProductImages({ productId: entry.name, productRoot: root });
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    const images = data.selected?.images || [];

    specDb.getFinderStore('productImageFinder').upsert({
      category: data.category,
      product_id: productId,
      images,
      image_count: images.length,
      carousel_slots: JSON.stringify(data.carousel_slots || {}),
      eval_state: JSON.stringify(extractEvalState(data)),
      evaluations: JSON.stringify(Array.isArray(data.evaluations) ? data.evaluations : []),
      latest_ran_at: data.last_ran_at || '',
      run_count: data.run_count || 0,
    });

    const runs = Array.isArray(data.runs) ? data.runs : [];
    for (const run of runs) {
      specDb.getFinderStore('productImageFinder').insertRun({
        category: data.category,
        product_id: productId,
        run_number: run.run_number,
        ran_at: run.ran_at,
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
