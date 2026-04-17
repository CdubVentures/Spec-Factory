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
import { extractEvalState } from './imageEvaluator.js';

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

// ── Orphan remap ────────────────────────────────────────────────────

/**
 * Remap orphaned variant_keys on PIF images to canonical registry keys.
 * Matches by variant_key (not variant_id — orphans have stale/wrong ids).
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} [opts.productRoot]
 * @param {Array<{oldKey, newKey, newVariantId, newLabel}>} opts.remaps
 * @param {object} [opts.specDb]
 * @returns {{ updated: boolean, counts: { images, runs, evalRecords, carouselSlots } }}
 */
export function remapOrphanedVariantKeys({ productId, productRoot, remaps, specDb }) {
  productRoot = productRoot || defaultProductRoot();
  const doc = readPifJson(productId, productRoot);

  if (!doc) return { updated: false, counts: { images: 0, runs: 0, evalRecords: 0, carouselSlots: 0 } };

  const counts = { images: 0, runs: 0, evalRecords: 0, carouselSlots: 0 };

  for (const { oldKey, newKey, newVariantId, newLabel } of remaps) {
    // WHY: Match by variant_key, not variant_id — orphaned images have stale ids.
    const remapImages = (images) => {
      if (!Array.isArray(images)) return 0;
      let count = 0;
      for (const img of images) {
        if (img.variant_key === oldKey) {
          img.variant_key = newKey;
          img.variant_id = newVariantId;
          if (newLabel) img.variant_label = newLabel;
          count++;
        }
      }
      return count;
    };

    counts.images += remapImages(doc.selected?.images);

    for (const run of (doc.runs || [])) {
      counts.images += remapImages(run.selected?.images);
      counts.images += remapImages(run.response?.images);

      if (run.response?.variant_key === oldKey) {
        run.response.variant_key = newKey;
        if (newLabel) run.response.variant_label = newLabel;
        counts.runs++;
      }
    }

    // Re-key carousel_slots
    if (doc.carousel_slots && doc.carousel_slots[oldKey] !== undefined) {
      doc.carousel_slots[newKey] = doc.carousel_slots[oldKey];
      delete doc.carousel_slots[oldKey];
      counts.carouselSlots++;
    }

    // Update evaluations
    if (Array.isArray(doc.evaluations)) {
      for (const ev of doc.evaluations) {
        if (ev.variant_key === oldKey) {
          ev.variant_key = newKey;
          if (newLabel) ev.variant_label = newLabel;
          counts.evalRecords++;
        }
      }
    }
  }

  writePifJson(productId, productRoot, doc);

  if (specDb) {
    const finderStore = specDb.getFinderStore?.('productImageFinder');
    if (finderStore) {
      finderStore.updateSummaryField(
        productId, 'carousel_slots',
        JSON.stringify(doc.carousel_slots || {}),
      );
      const imagesSummary = (doc.selected?.images || []).map(i => ({
        view: i.view, filename: i.filename, variant_key: i.variant_key,
      }));
      finderStore.updateSummaryField(productId, 'images', JSON.stringify(imagesSummary));
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
 * Collect all filenames belonging to a variant (from selected + all runs).
 * Must be called BEFORE image stripping so we know which files to check.
 */
function collectVariantFilenames(doc, variantId, variantKey) {
  const files = new Map(); // filename → { original_filename }
  const collect = (images) => {
    if (!Array.isArray(images)) return;
    for (const img of images) {
      if (img.variant_id === variantId || img.variant_key === variantKey) {
        if (img.filename) files.set(img.filename, { original_filename: img.original_filename });
      }
    }
  };
  collect(doc.selected?.images);
  for (const run of (doc.runs || [])) {
    collect(run.selected?.images);
    collect(run.response?.images);
  }
  return files;
}

/**
 * Delete image files from disk that are no longer referenced after variant removal.
 * Follows the same pattern as productImageFinderRoutes.js:1022-1030.
 */
function unlinkOrphanedImages(productRoot, productId, variantFilenames, doc) {
  if (variantFilenames.size === 0) return;

  // Build set of filenames still referenced by surviving data
  const surviving = new Set();
  for (const img of (doc.selected?.images || [])) {
    if (img.filename) surviving.add(img.filename);
  }
  for (const run of (doc.runs || [])) {
    for (const img of (run.selected?.images || [])) {
      if (img.filename) surviving.add(img.filename);
    }
    for (const img of (run.response?.images || [])) {
      if (img.filename) surviving.add(img.filename);
    }
  }

  const imagesDir = path.join(productRoot, productId, 'images');
  for (const [filename, meta] of variantFilenames) {
    if (surviving.has(filename)) continue;
    try { fs.unlinkSync(path.join(imagesDir, filename)); } catch { /* file may not exist */ }
    if (meta.original_filename) {
      try { fs.unlinkSync(path.join(imagesDir, 'originals', meta.original_filename)); } catch { /* */ }
    }
  }
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

  // WHY: Collect variant's filenames BEFORE modifications so we can delete orphaned disk files after.
  const variantFilenames = collectVariantFilenames(doc, variantId, variantKey);

  // 1. selected.images
  counts.images += removeImagesInPlace(doc.selected?.images, variantId, variantKey);

  // 2. runs — strip images then delete entire runs belonging to this variant
  const runs = Array.isArray(doc.runs) ? doc.runs : [];

  // Strip images from all runs first (handles cross-references and legacy runs)
  for (const run of runs) {
    removeImagesInPlace(run.selected?.images, variantId, variantKey);
    removeImagesInPlace(run.response?.images, variantId, variantKey);
  }

  // Delete entire runs targeting this variant
  const deletedRunNumbers = [];
  doc.runs = runs.filter(run => {
    const rKey = run.response?.variant_key;
    const rId = run.response?.variant_id;
    // Primary: match by variant identity (new runs always have these)
    if (rKey === variantKey || rId === variantId) {
      deletedRunNumbers.push(run.run_number);
      return false;
    }
    // WHY: Legacy runs may lack variant_key/variant_id (backfillPifVariantIds.js exists for this).
    // After image stripping, empty-shell runs are orphaned — clean them up.
    if (!rKey && !rId) {
      const noImages = (run.selected?.images || []).length === 0
                    && (run.response?.images || []).length === 0;
      if (noImages) {
        deletedRunNumbers.push(run.run_number);
        return false;
      }
    }
    return true;
  });
  counts.runs = deletedRunNumbers.length;

  // WHY: Recalculate bookkeeping. next_run_number stays exactly as-is (monotonic).
  doc.run_count = doc.runs.length;
  if (doc.runs.length > 0) {
    const sorted = [...doc.runs].sort((a, b) => (b.ran_at || '').localeCompare(a.ran_at || ''));
    doc.last_ran_at = sorted[0].ran_at || '';
  } else {
    doc.last_ran_at = '';
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

  // 5. Delete orphaned image files from disk
  unlinkOrphanedImages(productRoot, productId, variantFilenames, doc);

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
      // WHY: eval_state and evaluations must also sync — variant delete clears eval
      // fields on images and filters the evaluations array; runtime GET reads SQL.
      finderStore.updateSummaryField(productId, 'eval_state', JSON.stringify(extractEvalState(doc)));
      finderStore.updateSummaryField(productId, 'evaluations', JSON.stringify(doc.evaluations || []));

      // Delete SQL run rows + update bookkeeping
      if (deletedRunNumbers.length > 0) {
        for (const rn of deletedRunNumbers) {
          finderStore.removeRun(productId, rn);
        }
        finderStore.updateBookkeeping(productId, {
          latest_ran_at: doc.last_ran_at || '',
          run_count: doc.runs.length,
        });
      }
    }
  }

  return { updated: true, counts };
}
