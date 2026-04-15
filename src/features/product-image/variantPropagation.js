/**
 * Variant Propagation — rename variant_key across PIF data.
 *
 * WHY: When CEF identity check renames a variant (same variant_id, new
 * variant_key), all PIF data referencing the old key must be updated.
 * This function walks product_images.json and renames every occurrence,
 * using variant_id as the stable anchor.
 *
 * Images without variant_id are NOT renamed (can't confirm identity).
 * carousel_slots are re-keyed from old key to new key.
 * evaluations are matched by old variant_key (they don't carry variant_id).
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

function readPifJson(productId, productRoot) {
  try {
    const filePath = path.join(productRoot, productId, 'product_images.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writePifJson(productId, productRoot, doc) {
  const filePath = path.join(productRoot, productId, 'product_images.json');
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8');
}

/**
 * Rename variant_key on images matching variant_id.
 * Mutates in place. Returns count of renamed images.
 */
function renameImagesInPlace(images, variantId, oldKey, newKey, newLabel) {
  let count = 0;
  if (!Array.isArray(images)) return count;
  for (const img of images) {
    if (img.variant_id === variantId) {
      img.variant_key = newKey;
      if (newLabel) img.variant_label = newLabel;
      count++;
    }
  }
  return count;
}

/**
 * Propagate variant renames across all PIF data for a product.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} [opts.productRoot]
 * @param {Array<{variant_id, old_variant_key, new_variant_key, new_variant_label}>} opts.registryUpdates
 * @param {object} [opts.specDb] — if provided, updates SQL projection
 * @returns {{ updated: boolean, counts: { images, runs, evalRecords, carouselSlots } }}
 */
export function propagateVariantRenames({ productId, productRoot, registryUpdates, specDb }) {
  productRoot = productRoot || defaultProductRoot();
  const doc = readPifJson(productId, productRoot);

  if (!doc) return { updated: false, counts: { images: 0, runs: 0, evalRecords: 0, carouselSlots: 0 } };

  const counts = { images: 0, runs: 0, evalRecords: 0, carouselSlots: 0 };

  for (const update of registryUpdates) {
    const { variant_id: variantId, old_variant_key: oldKey, new_variant_key: newKey, new_variant_label: newLabel } = update;

    // 1. selected.images
    counts.images += renameImagesInPlace(doc.selected?.images, variantId, oldKey, newKey, newLabel);

    // 2. runs[].selected.images + runs[].response
    const runs = Array.isArray(doc.runs) ? doc.runs : [];
    for (const run of runs) {
      let runTouched = false;

      // Run selected images
      if (renameImagesInPlace(run.selected?.images, variantId, oldKey, newKey, newLabel) > 0) {
        runTouched = true;
      }

      // Run response top-level variant_key
      if (run.response?.variant_key === oldKey) {
        run.response.variant_key = newKey;
        if (newLabel) run.response.variant_label = newLabel;
        runTouched = true;
      }

      // Run response images
      if (renameImagesInPlace(run.response?.images, variantId, oldKey, newKey, newLabel) > 0) {
        runTouched = true;
      }

      if (runTouched) counts.runs++;
    }

    // 3. evaluations[] (matched by old variant_key — evals don't carry variant_id)
    const evals = Array.isArray(doc.evaluations) ? doc.evaluations : [];
    for (const ev of evals) {
      if (ev.variant_key === oldKey) {
        ev.variant_key = newKey;
        if (newLabel) ev.variant_label = newLabel;
        counts.evalRecords++;
      }
    }

    // 4. carousel_slots: re-key [oldKey] -> [newKey]
    if (doc.carousel_slots && doc.carousel_slots[oldKey] !== undefined) {
      doc.carousel_slots[newKey] = doc.carousel_slots[oldKey];
      delete doc.carousel_slots[oldKey];
      counts.carouselSlots++;
    }
  }

  writePifJson(productId, productRoot, doc);

  // WHY: SQL must stay in sync with JSON (CQRS — UI reads from DB).
  if (specDb) {
    const finderStore = specDb.getFinderStore('productImageFinder');
    if (finderStore) {
      finderStore.updateSummaryField(
        productId, 'carousel_slots',
        JSON.stringify(doc.carousel_slots || {}),
      );
      finderStore.updateSummaryField(
        productId, 'images',
        JSON.stringify((doc.selected?.images || []).map(i => ({
          view: i.view, filename: i.filename, variant_key: i.variant_key,
        }))),
      );
    }
  }

  return { updated: true, counts };
}

// ── Variant deletion ────────────────────────────────────────────────

/**
 * Remove images matching variant_id. Returns count of removed.
 */
function removeImagesInPlace(images, variantId, variantKey) {
  if (!Array.isArray(images)) return 0;
  const before = images.length;
  for (let i = images.length - 1; i >= 0; i--) {
    if (images[i].variant_id === variantId || images[i].variant_key === variantKey) {
      images.splice(i, 1);
    }
  }
  return before - images.length;
}

/**
 * Propagate variant deletion across all PIF data for a product.
 *
 * WHY: When a variant is deleted from the registry, all PIF data
 * referencing it (images, evals, carousel slots) must be cleaned up.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} opts.variantId
 * @param {string} opts.variantKey
 * @param {string} [opts.productRoot]
 * @param {object} [opts.specDb] — if provided, updates SQL projection
 * @returns {{ updated: boolean, counts: { images, runs, evalRecords, carouselSlots } }}
 */
export function propagateVariantDelete({ productId, variantId, variantKey, productRoot, specDb }) {
  productRoot = productRoot || defaultProductRoot();
  const doc = readPifJson(productId, productRoot);

  if (!doc) return { updated: false, counts: { images: 0, runs: 0, evalRecords: 0, carouselSlots: 0 } };

  const counts = { images: 0, runs: 0, evalRecords: 0, carouselSlots: 0 };

  // 1. selected.images
  counts.images += removeImagesInPlace(doc.selected?.images, variantId, variantKey);

  // 2. runs[].selected.images + runs[].response.images
  const runs = Array.isArray(doc.runs) ? doc.runs : [];
  for (const run of runs) {
    let runTouched = false;
    if (removeImagesInPlace(run.selected?.images, variantId, variantKey) > 0) runTouched = true;
    if (removeImagesInPlace(run.response?.images, variantId, variantKey) > 0) runTouched = true;
    if (runTouched) counts.runs++;
  }

  // 3. evaluations[] — filter out evals matching variant_key or variant_id
  if (Array.isArray(doc.evaluations)) {
    const before = doc.evaluations.length;
    doc.evaluations = doc.evaluations.filter(ev =>
      ev.variant_id !== variantId && ev.variant_key !== variantKey
    );
    counts.evalRecords = before - doc.evaluations.length;
  }

  // 4. carousel_slots[variantKey] — delete the key
  if (doc.carousel_slots && doc.carousel_slots[variantKey] !== undefined) {
    delete doc.carousel_slots[variantKey];
    counts.carouselSlots = 1;
  }

  writePifJson(productId, productRoot, doc);

  // WHY: SQL must stay in sync with JSON (CQRS — UI reads from DB).
  if (specDb) {
    const finderStore = specDb.getFinderStore('productImageFinder');
    if (finderStore) {
      finderStore.updateSummaryField(
        productId, 'carousel_slots',
        JSON.stringify(doc.carousel_slots || {}),
      );
      const imagesSummary = (doc.selected?.images || []).map(i => ({
        view: i.view, filename: i.filename, variant_key: i.variant_key,
      }));
      finderStore.updateSummaryField(productId, 'images', JSON.stringify(imagesSummary));
      finderStore.updateSummaryField(productId, 'image_count', imagesSummary.length);
    }
  }

  return { updated: true, counts };
}
