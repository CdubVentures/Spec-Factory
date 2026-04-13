/**
 * Product Image Finder — JSON store wrapper.
 *
 * Uses the generic finderJsonStore but overrides recalculation to
 * ACCUMULATE images across variants instead of latest-wins.
 * Each variant_key's latest non-rejected run wins, but other
 * variants are preserved.
 *
 * Durable SSOT: `.workspace/products/{pid}/product_images.json`
 */

import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';

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
