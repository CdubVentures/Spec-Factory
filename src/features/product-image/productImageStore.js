/**
 * Product Image Finder — JSON store wrapper.
 *
 * Thin delegation to the generic finderJsonStore factory.
 * Durable SSOT: `.workspace/products/{pid}/product_images.json`
 */

import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';

const store = createFinderJsonStore({
  filePrefix: 'product_images',
  emptySelected: () => ({ images: [] }),
});

export const readProductImages = store.read;
export const writeProductImages = store.write;
export const mergeProductImageDiscovery = store.merge;
export const deleteProductImageFinderRun = store.deleteRun;
export const deleteProductImageFinderAll = store.deleteAll;
export const recalculateProductImagesFromRuns = store.recalculateFromRuns;
