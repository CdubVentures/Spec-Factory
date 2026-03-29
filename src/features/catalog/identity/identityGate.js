/**
 * Identity Dedup Gate (Phase 15.1A)
 *
 * Gate decisions are based on a canonical identity set loaded from:
 * 1) product_catalog.json (preferred)
 * 2) activeFiltering.json (fallback)
 */

import { slugify } from './slugify.js';
import { cleanVariant, isFabricatedVariant } from './identityDedup.js';
import { loadProductCatalog } from '../products/productCatalog.js';
import { normalizeText, normalizeTokenCollapsed } from '../../../shared/primitives.js';

function pairKey(brand, model) {
  const b = normalizeTokenCollapsed(brand);
  const m = normalizeTokenCollapsed(model);
  if (!b || !m) return '';
  return `${b}||${m}`;
}

function tupleKey(brand, model, variant) {
  const base = pairKey(brand, model);
  if (!base) return '';
  return `${base}||${normalizeTokenCollapsed(cleanVariant(variant))}`;
}

function firstCanonicalProductId(index, brand, model) {
  const variants = index.pairVariants.get(pairKey(brand, model));
  if (!variants || variants.size === 0) return '';
  for (const variant of variants) {
    const pid = index.tupleToProductId.get(tupleKey(brand, model, variant));
    if (pid) return pid;
  }
  return '';
}

export function buildCanonicalIdentityIndex({
  category,
  source = 'none',
  products = []
}) {
  const cat = normalizeText(category).toLowerCase();
  const pairVariants = new Map();
  const tupleToProductId = new Map();

  for (const row of Array.isArray(products) ? products : []) {
    const brand = normalizeText(row.brand);
    const model = normalizeText(row.model);
    if (!brand || !model) continue;
    const variant = cleanVariant(row.variant);

    const pKey = pairKey(brand, model);
    if (!pairVariants.has(pKey)) pairVariants.set(pKey, new Set());
    pairVariants.get(pKey).add(normalizeTokenCollapsed(variant));

    const pid = normalizeText(row.productId) || '';
    tupleToProductId.set(tupleKey(brand, model, variant), pid);
  }

  return {
    category: cat,
    source,
    pairVariants,
    tupleToProductId
  };
}

export async function loadCanonicalIdentityIndex({ config, category }) {
  const cat = normalizeText(category).toLowerCase();
  const catalog = await loadProductCatalog(config, cat);
  const catalogEntries = Object.entries(catalog.products || {});

  if (catalogEntries.length > 0) {
    const products = catalogEntries.map(([productId, row]) => ({
      productId,
      brand: row.brand,
      model: row.model,
      variant: row.variant || ''
    }));
    return buildCanonicalIdentityIndex({
      category: cat,
      source: 'product_catalog',
      products
    });
  }

  return buildCanonicalIdentityIndex({
    category: cat,
    source: 'none',
    products: []
  });
}

export function evaluateIdentityGate({
  category,
  brand,
  model,
  variant = '',
  canonicalIndex
}) {
  const cat = normalizeText(category).toLowerCase();
  const cleanBrand = normalizeText(brand);
  const cleanModel = normalizeText(model);
  const cleanVar = cleanVariant(variant);

  if (!cleanBrand || !cleanModel) {
    return {
      valid: false,
      reason: 'identity_incomplete',
      canonicalProductId: '',
      normalized: {
        brand: cleanBrand,
        model: cleanModel,
        variant: cleanVar
      }
    };
  }

  const normalized = {
    brand: cleanBrand,
    model: cleanModel,
    variant: cleanVar
  };

  if (cleanVar && isFabricatedVariant(cleanModel, cleanVar)) {
    const canonicalProductId =
      canonicalIndex?.tupleToProductId?.get(tupleKey(cleanBrand, cleanModel, ''))
      || '';
    return {
      valid: false,
      reason: 'variant_is_model_substring',
      canonicalProductId,
      normalized
    };
  }

  const pKey = pairKey(cleanBrand, cleanModel);
  const knownVariants = canonicalIndex?.pairVariants?.get(pKey);
  if (!knownVariants || knownVariants.size === 0) {
    return {
      valid: true,
      reason: null,
      canonicalProductId: '',
      normalized
    };
  }

  const variantToken = normalizeTokenCollapsed(cleanVar);
  if (knownVariants.has(variantToken)) {
    const canonicalProductId =
      canonicalIndex?.tupleToProductId?.get(tupleKey(cleanBrand, cleanModel, cleanVar))
      || '';
    return {
      valid: true,
      reason: null,
      canonicalProductId,
      normalized
    };
  }

  if (variantToken && knownVariants.has('')) {
    return {
      valid: false,
      reason: 'canonical_without_variant_exists',
      canonicalProductId:
        canonicalIndex?.tupleToProductId?.get(tupleKey(cleanBrand, cleanModel, ''))
        || '',
      normalized
    };
  }

  if (!variantToken && knownVariants.size > 0) {
    return {
      valid: false,
      reason: 'canonical_variant_exists',
      canonicalProductId: firstCanonicalProductId(canonicalIndex, cleanBrand, cleanModel),
      normalized
    };
  }

  return {
    valid: false,
    reason: 'variant_conflict',
    canonicalProductId: firstCanonicalProductId(canonicalIndex, cleanBrand, cleanModel),
    normalized
  };
}

export function registerCanonicalIdentity({
  canonicalIndex,
  brand,
  model,
  variant = '',
  productId = ''
}) {
  if (!canonicalIndex) return;
  const cleanBrand = normalizeText(brand);
  const cleanModel = normalizeText(model);
  if (!cleanBrand || !cleanModel) return;
  const cleanVar = cleanVariant(variant);

  const pKey = pairKey(cleanBrand, cleanModel);
  if (!canonicalIndex.pairVariants.has(pKey)) {
    canonicalIndex.pairVariants.set(pKey, new Set());
  }
  canonicalIndex.pairVariants.get(pKey).add(normalizeTokenCollapsed(cleanVar));

  const pid = normalizeText(productId) || '';
  canonicalIndex.tupleToProductId.set(tupleKey(cleanBrand, cleanModel, cleanVar), pid);
}

