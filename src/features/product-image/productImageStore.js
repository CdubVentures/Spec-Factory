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
  // WHY: Override recalculateFromRuns to accumulate images across variants.
  // The generic store uses latest-wins (selected = last non-rejected run).
  // PIF needs: latest run PER variant_key wins, other variants preserved.
  recalculateSelected: (runs) => {
    const byVariant = new Map();
    // Process runs in order — later runs overwrite earlier ones per variant.
    const sorted = [...runs]
      .filter(r => r.status !== 'rejected')
      .sort((a, b) => a.run_number - b.run_number);

    for (const run of sorted) {
      const images = run.selected?.images || [];
      for (const img of images) {
        if (img.variant_key) {
          // Collect all images for this variant from this run
          if (!byVariant.has(img.variant_key)) byVariant.set(img.variant_key, []);
          // Replace — latest run per variant wins
          const existing = byVariant.get(img.variant_key);
          const viewIdx = existing.findIndex(e => e.view === img.view);
          if (viewIdx >= 0) existing[viewIdx] = img;
          else existing.push(img);
        }
      }
    }

    // Flatten all variants into a single images array
    const images = [];
    for (const variantImages of byVariant.values()) {
      images.push(...variantImages);
    }
    return { images };
  },
});

export const readProductImages = store.read;
export const writeProductImages = store.write;
export const mergeProductImageDiscovery = store.merge;
export const deleteProductImageFinderRun = store.deleteRun;
export const deleteProductImageFinderAll = store.deleteAll;
export const recalculateProductImagesFromRuns = store.recalculateFromRuns;
