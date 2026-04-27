/**
 * PIF "Delete All" → full reset cascade.
 *
 * The generic finder route handler erases runs JSON + runs SQL + summary
 * bookkeeping for us. This helper handles the PIF-specific extras that
 * scalar finders (RDF/SKU/KF) don't have:
 *
 *   1. Image files on disk (master + originals/)
 *   2. evaluations[] in the per-product JSON
 *   3. carousel_slots in the per-product JSON
 *   4. pif_variant_progress SQL projection rows
 *
 * Wired as `onAfterDeleteAll` in productImageFinderRoutes.js so a single
 * DELETE /product-image-finder/:cat/:pid request truly wipes everything.
 *
 * Side-effect-only — best-effort per artifact so a missing file or
 * already-deleted projection row doesn't abort the rest of the cascade.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readProductImages, writeProductImages } from './productImageStore.js';

function deleteProductImageDir({ productId, productRoot }) {
  const imagesDir = path.join(productRoot, productId, 'images');
  if (!fs.existsSync(imagesDir)) return;
  // rm with recursive removes the originals/ subdirectory too in one call.
  // We then recreate the (empty) images dir so subsequent runs can write
  // straight into it without first having to mkdir.
  try {
    fs.rmSync(imagesDir, { recursive: true, force: true });
    fs.mkdirSync(imagesDir, { recursive: true });
  } catch { /* best-effort — disk error shouldn't kill the cascade */ }
}

function clearJsonExtras({ productId, productRoot }) {
  const existing = readProductImages({ productId, productRoot });
  if (!existing) return;
  const cleaned = {
    ...existing,
    evaluations: [],
    carousel_slots: {},
    selected: { images: [] },
    runs: [],
    run_count: 0,
    next_run_number: 1,
  };
  cleaned.updated_at = new Date().toISOString();
  writeProductImages({ productId, productRoot, data: cleaned });
}

function clearProjection({ specDb, productId }) {
  if (typeof specDb?.deletePifVariantProgressByProduct !== 'function') return;
  try {
    specDb.deletePifVariantProgressByProduct(productId);
  } catch { /* best-effort */ }
}

function clearSqlSummaryArtifacts({ specDb, productId }) {
  const finderStore = specDb?.getFinderStore?.('productImageFinder');
  if (typeof finderStore?.updateSummaryField !== 'function') return;
  [
    ['images', '[]'],
    ['image_count', 0],
    ['carousel_slots', '{}'],
    ['eval_state', '{}'],
    ['evaluations', '[]'],
  ].forEach(([field, value]) => {
    try {
      finderStore.updateSummaryField(productId, field, value);
    } catch { /* best-effort */ }
  });
}

/**
 * Full-reset every PIF artifact for a product.
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance (for projection wipe)
 * @param {string} opts.productId
 * @param {string} opts.productRoot — workspace product root
 */
export function fullResetProductImages({ specDb, productId, productRoot }) {
  if (!productId || !productRoot) return;
  clearJsonExtras({ productId, productRoot });
  deleteProductImageDir({ productId, productRoot });
  clearProjection({ specDb, productId });
  clearSqlSummaryArtifacts({ specDb, productId });
}
