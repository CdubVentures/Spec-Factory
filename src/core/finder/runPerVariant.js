/**
 * Shared per-variant runner.
 *
 * Loads variants from the generator's SQL table, filters to a single
 * variant if requested, and fires a staggered concurrent loop calling
 * the caller-supplied `produceForVariant` per variant. Rejects if
 * the generator hasn't produced variants yet (caller should run CEF first).
 *
 * Used by `variantFieldProducer` and `variantArtifactProducer` modules
 * (e.g. PIF, and future Release Date / SKU / Price finders). Each module
 * provides its own domain-specific `produceForVariant` callback.
 */

/**
 * @typedef {object} VariantRow
 * @property {string} variant_id
 * @property {string} key              — variant_key (e.g. "color:black")
 * @property {string} label            — variant_label
 * @property {string} type             — variant_type ("color" | "edition")
 */

/**
 * @typedef {object} PerVariantResult
 * @property {VariantRow} variant
 * @property {object|null} result      — whatever produceForVariant returned
 * @property {string|null} error       — error message if produceForVariant threw
 */

/**
 * @param {object} opts
 * @param {object} opts.specDb                      — SpecDb instance with variants store
 * @param {object} opts.product                     — { product_id, category, ... }
 * @param {string|null} [opts.variantKey]           — filter to single variant
 * @param {number} [opts.staggerMs]                 — delay between variant firings
 * @param {(variant: VariantRow, index: number, ctx: {total: number}) => Promise<object>} opts.produceForVariant
 * @param {(stage: string) => void} [opts.onStageAdvance]
 * @param {(completed: number, total: number, variantKey: string) => void} [opts.onVariantProgress]
 * @param {object} [opts.logger]
 * @returns {Promise<{rejected: boolean, rejections?: object[], perVariantResults: PerVariantResult[], variants: VariantRow[]}>}
 */
export async function runPerVariant({
  specDb, product,
  variantKey = null,
  staggerMs = 1000,
  produceForVariant,
  onStageAdvance = null,
  onVariantProgress = null,
  logger = null,
}) {
  const dbVariants = specDb.variants?.listActive(product.product_id) || [];
  if (dbVariants.length === 0) {
    return {
      rejected: true,
      rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }],
      perVariantResults: [],
      variants: [],
    };
  }

  const allVariants = dbVariants.map((v) => ({
    variant_id: v.variant_id,
    key: v.variant_key,
    label: v.variant_label,
    type: v.variant_type,
  }));

  const variants = variantKey
    ? allVariants.filter((v) => v.key === variantKey)
    : allVariants;

  if (variants.length === 0) {
    return {
      rejected: true,
      rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }],
      perVariantResults: [],
      variants: [],
    };
  }

  const perVariantResults = [];

  const promises = variants.map((variant, i) => {
    const delay = i * staggerMs;
    return new Promise((resolve) => setTimeout(resolve, delay)).then(async () => {
      onStageAdvance?.(`${variant.type === 'edition' ? 'Ed' : 'Color'}: ${variant.label}`);
      onVariantProgress?.(i, variants.length, variant.key);

      try {
        const result = await produceForVariant(variant, i, { total: variants.length });
        perVariantResults.push({ variant, result: result ?? null, error: null });
      } catch (err) {
        logger?.error?.('variant_failed', {
          product_id: product.product_id, variant: variant.key, error: err.message,
        });
        perVariantResults.push({ variant, result: null, error: err.message });
      }
    });
  });

  await Promise.all(promises);

  onVariantProgress?.(variants.length, variants.length, 'done');

  return { rejected: false, perVariantResults, variants };
}
