/**
 * Backfill variant_id on existing PIF data.
 *
 * Scans all product directories, reads CEF variant_registry,
 * and stamps variant_id on PIF images and run responses that
 * are missing it. Idempotent — skips already-stamped entries.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Stamp variant_id on images matching variant_key from registry.
 * Only stamps if variant_id is missing. Mutates in place.
 * @returns {number} count of newly stamped images
 */
function stampImages(images, registryMap) {
  let count = 0;
  if (!Array.isArray(images)) return count;
  for (const img of images) {
    if (img.variant_id) continue;
    const id = registryMap.get(img.variant_key);
    if (id) {
      img.variant_id = id;
      count++;
    }
  }
  return count;
}

/**
 * Stamp OR remap variant_id on images. Unlike stampImages (which only fills
 * missing ids), this also corrects stale ids where the key matches but the
 * id drifted (e.g. bug-era fresh registry rebuilds).
 * @returns {{ stamped: number, remapped: number }}
 */
function stampOrRemapImages(images, registryMap) {
  let stamped = 0;
  let remapped = 0;
  if (!Array.isArray(images)) return { stamped, remapped };
  for (const img of images) {
    const correctId = registryMap.get(img.variant_key);
    if (!correctId) continue;
    if (!img.variant_id) {
      img.variant_id = correctId;
      stamped++;
    } else if (img.variant_id !== correctId) {
      img.variant_id = correctId;
      remapped++;
    }
  }
  return { stamped, remapped };
}

/**
 * Backfill + remap variant_ids for a single product.
 * Takes registry directly (no CEF JSON read). Idempotent.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {Array} opts.registry — current variant_registry entries
 * @param {string} [opts.productRoot]
 * @param {object} [opts.specDb] — if provided, updates SQL projection
 * @returns {{ stamped: number, remapped: number }}
 */
export function backfillPifVariantIdsForProduct({ productId, registry, productRoot, specDb } = {}) {
  const root = productRoot || defaultProductRoot();
  const stats = { stamped: 0, remapped: 0 };
  if (!Array.isArray(registry) || registry.length === 0) return stats;

  const pifPath = path.join(root, productId, 'product_images.json');
  const pifDoc = readJson(pifPath);
  if (!pifDoc) return stats;

  const registryMap = new Map(registry.map(r => [r.variant_key, r.variant_id]));
  let touched = false;

  // selected.images
  const selResult = stampOrRemapImages(pifDoc.selected?.images, registryMap);
  stats.stamped += selResult.stamped;
  stats.remapped += selResult.remapped;

  // runs[].selected.images + runs[].response.images
  const runs = Array.isArray(pifDoc.runs) ? pifDoc.runs : [];
  for (const run of runs) {
    const selRunResult = stampOrRemapImages(run.selected?.images, registryMap);
    stats.stamped += selRunResult.stamped;
    stats.remapped += selRunResult.remapped;

    const respResult = stampOrRemapImages(run.response?.images, registryMap);
    stats.stamped += respResult.stamped;
    stats.remapped += respResult.remapped;

    // Top-level run.response.variant_id
    if (run.response?.variant_key) {
      const correctId = registryMap.get(run.response.variant_key);
      if (correctId) {
        if (!run.response.variant_id) {
          run.response.variant_id = correctId;
          stats.stamped++;
        } else if (run.response.variant_id !== correctId) {
          run.response.variant_id = correctId;
          stats.remapped++;
        }
      }
    }
  }

  touched = (stats.stamped + stats.remapped) > 0;

  if (touched) {
    writeJson(pifPath, pifDoc);

    if (specDb) {
      const finderStore = specDb.getFinderStore?.('productImageFinder');
      if (finderStore) {
        finderStore.updateSummaryField(
          productId, 'images',
          JSON.stringify((pifDoc.selected?.images || []).map(i => ({
            view: i.view, filename: i.filename, variant_key: i.variant_key,
          }))),
        );
      }
    }
  }

  return stats;
}

/**
 * @param {object} opts
 * @param {object} [opts.specDb] — if provided, updates SQL projection
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, backfilled: number, skipped: number }}
 */
export function backfillPifVariantIds({ specDb, productRoot } = {}) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, backfilled: 0, skipped: 0 };

  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return stats; }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pid = entry.name;
    const pifPath = path.join(root, pid, 'product_images.json');
    const cefPath = path.join(root, pid, 'color_edition.json');

    const pifDoc = readJson(pifPath);
    if (!pifDoc) continue;

    const cefDoc = readJson(cefPath);
    if (!cefDoc) continue;

    const registry = cefDoc.variant_registry;
    if (!Array.isArray(registry) || registry.length === 0) {
      stats.skipped++;
      continue;
    }

    stats.found++;
    const registryMap = new Map(registry.map(r => [r.variant_key, r.variant_id]));

    let touched = 0;

    // selected.images
    touched += stampImages(pifDoc.selected?.images, registryMap);

    // runs[].selected.images + runs[].response
    const runs = Array.isArray(pifDoc.runs) ? pifDoc.runs : [];
    for (const run of runs) {
      touched += stampImages(run.selected?.images, registryMap);
      touched += stampImages(run.response?.images, registryMap);

      // Top-level run.response.variant_id
      if (!run.response?.variant_id && run.response?.variant_key) {
        const id = registryMap.get(run.response.variant_key);
        if (id) {
          run.response.variant_id = id;
          touched++;
        }
      }
    }

    if (touched > 0) {
      writeJson(pifPath, pifDoc);

      // SQL projection
      if (specDb) {
        const finderStore = specDb.getFinderStore?.('productImageFinder');
        if (finderStore) {
          finderStore.updateSummaryField(
            pid, 'images',
            JSON.stringify((pifDoc.selected?.images || []).map(i => ({
              view: i.view, filename: i.filename, variant_key: i.variant_key,
            }))),
          );
        }
      }

      stats.backfilled++;
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

/**
 * Collect variant_keys that appear on PIF images but NOT in the registry.
 * Pure read — no mutations.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {Array} opts.registry — current variant_registry entries
 * @param {string} [opts.productRoot]
 * @returns {string[]} orphaned variant_keys
 */
export function collectOrphanedPifKeys({ productId, registry, productRoot } = {}) {
  const root = productRoot || defaultProductRoot();
  const pifPath = path.join(root, productId, 'product_images.json');
  const pifDoc = readJson(pifPath);
  if (!pifDoc) return [];

  const registryKeys = new Set((registry || []).map(r => r.variant_key));
  const pifKeys = new Set();

  const collect = (images) => {
    if (!Array.isArray(images)) return;
    for (const img of images) {
      if (img.variant_key) pifKeys.add(img.variant_key);
    }
  };

  collect(pifDoc.selected?.images);
  for (const run of (pifDoc.runs || [])) {
    collect(run.selected?.images);
    collect(run.response?.images);
  }

  return [...pifKeys].filter(k => !registryKeys.has(k));
}
