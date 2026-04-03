/**
 * Identity Dedup Gate — prevents duplicate product input files
 * by detecting fabricated variants and normalizing identity before sync.
 *
 * A "fabricated variant" is one where the variant value is already
 * contained within the model name (e.g. model="Cestus 310", variant="310").
 * These duplicates arose from a legacy seed import with an empty variant row.
 */

import { slugify } from './slugify.js';

const VARIANT_PLACEHOLDERS = new Set([
  '', 'unk', 'unknown', 'na', 'n/a', 'none', 'null', '-', 'default'
]);

/**
 * Clean variant: strip placeholder values that don't represent real variants.
 */
export function cleanVariant(variant) {
  const trimmed = String(variant ?? '').trim();
  return VARIANT_PLACEHOLDERS.has(trimmed.toLowerCase()) ? '' : trimmed;
}

/**
 * Derive the full model name from base_model + variant.
 * base_model is the family name, variant is the differentiator.
 * model = base_model when no variant, base_model + " " + variant otherwise.
 */
export function deriveFullModel(baseModel, variant) {
  const b = String(baseModel ?? '').trim();
  const v = String(variant ?? '').trim();
  if (!b) return v;
  return v ? `${b} ${v}` : b;
}

/**
 * Detect whether a variant is "fabricated" — i.e. its tokens are
 * already present in the model name, so it adds no distinguishing info.
 *
 * Examples:
 *   model="Cestus 310",   variant="310"        → fabricated (all variant tokens in model)
 *   model="Alienware Pro",variant="Pro"         → fabricated
 *   model="ROG Gladius III",variant="Gladius III"→ fabricated
 *   model="Viper V3 Pro", variant="Wireless"    → NOT fabricated (new info)
 *   model="Viper V3 Pro", variant=""            → NOT fabricated (empty)
 */
export function isFabricatedVariant(model, variant) {
  const cleanedVariant = cleanVariant(variant);
  if (!cleanedVariant) return false;

  const modelSlug = slugify(model);
  const variantSlug = slugify(cleanedVariant);
  if (!modelSlug || !variantSlug) return false;

  // Check if variant slug is a substring of model slug
  if (modelSlug.includes(variantSlug)) return true;

  // Token-level check: every token in the variant exists in the model
  const modelTokens = new Set(modelSlug.split('-'));
  const variantTokens = variantSlug.split('-');
  return variantTokens.length > 0 && variantTokens.every(t => modelTokens.has(t));
}

/**
 * Canonical identity normalizer — the ONE place that owns the
 * { base_model, variant } → { base_model, model, variant } derivation.
 *
 * @param {string} category — reserved (unused, kept for call-site compat)
 * @param {string} brand
 * @param {string} model — the base_model value (user-entered family name)
 * @param {string} variant
 * @returns {{ brand: string, base_model: string, model: string, variant: string, wasCleaned: boolean, reason: string|null }}
 */
export function normalizeProductIdentity(category, brand, model, variant) {
  const cleanedBrand = String(brand ?? '').trim();
  const cleanedBaseModel = String(model ?? '').trim();
  let cleanedVariant = cleanVariant(variant);
  let wasCleaned = false;
  let reason = null;

  if (cleanedVariant && isFabricatedVariant(cleanedBaseModel, cleanedVariant)) {
    cleanedVariant = '';
    wasCleaned = true;
    reason = 'fabricated_variant_stripped';
  }

  return {
    brand: cleanedBrand,
    base_model: cleanedBaseModel,
    model: deriveFullModel(cleanedBaseModel, cleanedVariant),
    variant: cleanedVariant,
    wasCleaned,
    reason
  };
}
