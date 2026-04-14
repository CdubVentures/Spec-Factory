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
