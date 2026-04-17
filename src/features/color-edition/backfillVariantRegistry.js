/**
 * Backfill variant registry for existing products.
 *
 * Scans all product directories, generates variant_registry from CEF
 * selected data for products that don't have one yet, writes back to
 * the JSON SSOT (color_edition.json).
 *
 * Idempotent: products with existing registries are skipped.
 */

import fs from 'node:fs';
import { readColorEdition, writeColorEdition } from './colorEditionStore.js';
import { buildVariantRegistry } from './variantRegistry.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

/**
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, backfilled: number, skipped: number }}
 */
export function backfillVariantRegistry({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, backfilled: 0, skipped: 0 };

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const data = readColorEdition({ productId: entry.name, productRoot: root });
    if (!data) { stats.skipped++; continue; }
    if (data.category !== specDb.category) { stats.skipped++; continue; }

    stats.found++;

    // WHY: Skip products that already have a registry — idempotent.
    if (data.variant_registry && data.variant_registry.length > 0) {
      stats.skipped++;
      continue;
    }

    const colors = data.selected?.colors || [];
    const colorNames = data.selected?.color_names || {};
    const editions = data.selected?.editions || {};

    if (colors.length === 0 && Object.keys(editions).length === 0) {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    const registry = buildVariantRegistry({ productId, colors, colorNames, editions });

    data.variant_registry = registry;
    writeColorEdition({ productId: entry.name, productRoot: root, data });

    stats.backfilled++;
  }

  return stats;
}
