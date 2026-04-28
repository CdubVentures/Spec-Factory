/**
 * PIF variant progress rebuilder.
 *
 * Satisfies the CLAUDE.md Rebuild Contract for the `pif_variant_progress`
 * table: given only per-product `product_images.json` files, reconstruct
 * the full per-variant carousel-progress projection in SQL.
 *
 * Three buckets per variant:
 *   priority = carousel view count over scored carousel target
 *   loop     = additional carousel image count over extra-image target
 *   hero     = Hero Slots               — heroCount when heroEnabled
 *
 * Durable SSOT: `.workspace/products/{pid}/product_images.json`
 */

import fs from 'node:fs';
import { readProductImages } from './productImageStore.js';
import { resolveCarouselSlots } from './imageEvaluator.js';
import { resolveCarouselViewSettings } from './carouselSlotSettings.js';
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
  const {
    carouselScoredViews,
    carouselSlotViews,
    carouselExtraTarget,
  } = resolveCarouselViewSettings({ finderStore, category: specDb.category });
  const heroEnabledRaw = finderStore?.getSetting?.('heroEnabled');
  const heroEnabled = String(heroEnabledRaw ?? 'true') !== 'false';
  const heroCount = parseInt(finderStore?.getSetting?.('heroCount') || '3', 10) || 3;
  const scoredSet = new Set(carouselScoredViews);

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

    // Full image set with eval_best / hero / hero_rank flags intact. Needed by
    // resolveCarouselSlots to decide which slot each image occupies.
    const fullImages = data.selected?.images || [];
    const carouselSlots = data.carousel_slots || {};

    const variants = specDb.variants?.listActive?.(productId) || [];
    if (variants.length === 0) {
      stats.skipped++;
      continue;
    }

    const countFilled = (slots) =>
      slots.filter((s) => s.filename && s.filename !== '__cleared__').length;

    for (const v of variants) {
      const viewResolved = resolveCarouselSlots({
        viewBudget: carouselScoredViews, carouselSlotViews, heroCount: 0, variantKey: v.variant_key, variantId: v.variant_id,
        carouselSlots, images: fullImages,
      });
      const heroResolved = resolveCarouselSlots({
        viewBudget: [], heroCount: heroEnabled ? heroCount : 0,
        variantKey: v.variant_key, variantId: v.variant_id,
        carouselSlots, images: fullImages,
      });
      const imageCount = fullImages.filter((img) => {
        if (v.variant_id && img?.variant_id === v.variant_id) return true;
        return (img?.variant_key || '') === (v.variant_key || '');
      }).length;
      const filledViews = viewResolved.filter((s) =>
        !s.slot.startsWith('hero_') && s.filename && s.filename !== '__cleared__');

      specDb.upsertPifVariantProgress({
        productId,
        variantId: v.variant_id,
        variantKey: v.variant_key,
        priorityFilled: filledViews.length,
        priorityTotal: carouselScoredViews.length,
        loopFilled: filledViews.filter((s) => !scoredSet.has(s.slot)).length,
        loopTotal: carouselExtraTarget,
        heroFilled: countFilled(heroResolved.filter((s) => s.slot.startsWith('hero_'))),
        heroTarget: heroEnabled ? heroCount : 0,
        imageCount,
      });
      stats.variants_seeded++;
    }
    stats.seeded++;
  }

  return stats;
}
