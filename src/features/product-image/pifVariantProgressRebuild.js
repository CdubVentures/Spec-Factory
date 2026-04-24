/**
 * PIF variant progress rebuilder.
 *
 * Satisfies the CLAUDE.md Rebuild Contract for the `pif_variant_progress`
 * table: given only per-product `product_images.json` files, reconstruct
 * the full per-variant carousel-progress projection in SQL.
 *
 * Three buckets per variant:
 *   priority = Views (Single Run)       — viewConfig entries with priority:true
 *   loop     = Loop Run extras          — viewBudget views NOT in priority
 *   hero     = Hero Slots               — heroCount when heroEnabled
 *
 * Durable SSOT: `.workspace/products/{pid}/product_images.json`
 */

import fs from 'node:fs';
import { readProductImages } from './productImageStore.js';
import { evaluateCarousel } from './carouselStrategy.js';
import { resolveViewBudget, resolveViewConfig } from './productImageLlmAdapter.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

/**
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance (category-scoped)
 * @param {string} [opts.productRoot]
 * @returns {{ found: number, seeded: number, skipped: number, variants_seeded: number }}
 */
export function rebuildPifVariantProgressFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0, variants_seeded: 0 };

  if (!specDb || typeof specDb.upsertPifVariantProgress !== 'function') {
    return stats;
  }

  const finderStore = specDb.getFinderStore?.('productImageFinder');
  const viewConfig = resolveViewConfig(finderStore?.getSetting?.('viewConfig') || '', specDb.category);
  const viewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', specDb.category);
  const priorityKeys = viewConfig.filter((v) => v.priority).map((v) => v.key);
  const prioritySet = new Set(priorityKeys);
  const loopExtrasKeys = viewBudget.filter((k) => !prioritySet.has(k));
  const heroEnabledRaw = finderStore?.getSetting?.('heroEnabled');
  const heroEnabled = String(heroEnabledRaw ?? 'true') !== 'false';
  const heroCount = parseInt(finderStore?.getSetting?.('heroCount') || '3', 10) || 3;
  const satisfactionThreshold = parseInt(finderStore?.getSetting?.('satisfactionThreshold') || '3', 10) || 3;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const productId = entry.name;

    const data = readProductImages({ productId, productRoot: root });
    if (!data) continue;
    stats.found++;

    if (data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const images = (data.selected?.images || []).map((img) => ({
      view: img.view,
      variant_key: img.variant_key,
      quality_pass: img.quality_pass !== false,
    }));

    const variants = specDb.variants?.listActive?.(productId) || [];
    if (variants.length === 0) {
      stats.skipped++;
      continue;
    }

    for (const v of variants) {
      const priority = evaluateCarousel({
        collectedImages: images, viewBudget: priorityKeys, satisfactionThreshold,
        heroEnabled: false, heroCount: 0, variantKey: v.variant_key, variantId: v.variant_id,
      }).carouselProgress;
      const loop = evaluateCarousel({
        collectedImages: images, viewBudget: loopExtrasKeys, satisfactionThreshold,
        heroEnabled: false, heroCount: 0, variantKey: v.variant_key, variantId: v.variant_id,
      }).carouselProgress;
      const hero = evaluateCarousel({
        collectedImages: images, viewBudget: [], satisfactionThreshold,
        heroEnabled, heroCount, variantKey: v.variant_key, variantId: v.variant_id,
      }).carouselProgress;

      specDb.upsertPifVariantProgress({
        productId,
        variantId: v.variant_id,
        variantKey: v.variant_key,
        priorityFilled: Number(priority.viewsFilled) || 0,
        priorityTotal: priorityKeys.length,
        loopFilled: Number(loop.viewsFilled) || 0,
        loopTotal: loopExtrasKeys.length,
        heroFilled: Number(hero.heroCount) || 0,
        heroTarget: heroEnabled ? heroCount : 0,
      });
      stats.variants_seeded++;
    }
    stats.seeded++;
  }

  return stats;
}
