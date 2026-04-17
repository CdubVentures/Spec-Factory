/**
 * Product Catalog — per-category product management.
 *
 * SSOT: product.json per product (.workspace/products/{pid}/product.json).
 * SQL products table is the runtime cache, rebuilt from product.json via scanAndSeedCheckpoints.
 * CRUD writes to SQL via upsertCatalogProductRow (called from catalogRoutes.js).
 */

import { normalizeProductIdentity } from '../identity/identityDedup.js';
import { generateIdentifier } from '../identity/productIdentity.js';
import { writeProductIdentity } from './writeProductIdentity.js';
import { buildProductId } from '../../../shared/primitives.js';
import { resolveBrandIdentifier } from '../identity/resolveBrandIdentifier.js';

function nowIso() {
  return new Date().toISOString();
}

// ── CRUD ──────────────────────────────────────────────────────────

/**
 * Add a product. Creates catalog entry + input file + queue entry.
 * Returns { ok, productId, product } or { ok: false, error }.
 */
export async function addProduct({
  config,
  category,
  brand,
  base_model,
  variant = '',
  storage = null,
  specDb = null,
  appDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  const cleanBrand = String(brand ?? '').trim();
  // WHY: base_model is the primary user-entered field. model is derived by the normalizer.
  const cleanBaseModel = String(base_model ?? '').trim();

  if (!cat) return { ok: false, error: 'category_required' };
  if (!cleanBrand) return { ok: false, error: 'brand_required' };
  if (!cleanBaseModel) return { ok: false, error: 'model_required' };

  // Normalize identity (strips fabricated variants against base_model)
  const identity = normalizeProductIdentity(cat, cleanBrand, cleanBaseModel, variant);

  // WHY: SQL is the sole SSOT for products.
  const allProducts = specDb?.getAllProducts?.() || [];
  const existingPid = allProducts.find((r) =>
    String(r.brand || '').trim().toLowerCase() === identity.brand.toLowerCase() &&
    String(r.base_model || '').trim().toLowerCase() === identity.base_model.toLowerCase() &&
    String(r.variant || '').trim().toLowerCase() === identity.variant.toLowerCase()
  )?.product_id || null;
  if (existingPid) {
    return { ok: false, error: 'product_already_exists', productId: existingPid };
  }

  const pid = buildProductId(cat);

  const product = {
    identifier: generateIdentifier(),
    brand: identity.brand,
    base_model: identity.base_model,
    model: identity.model,
    variant: identity.variant,
    brand_identifier: resolveBrandIdentifier(appDb, identity.brand),
    status: 'active',
    added_at: nowIso(),
    added_by: 'gui'
  };

  // WHY: Write the rebuild SSOT product.json at .workspace/products/{pid}/
  try {
    writeProductIdentity({
      productId: pid,
      category: cat,
      identity: { brand: identity.brand, base_model: identity.base_model, model: identity.model, variant: identity.variant, brand_identifier: product.brand_identifier },
      identifier: product.identifier,
    });
  } catch { /* best-effort: pipeline still works without product.json */ }

  return { ok: true, productId: pid, product };
}

/**
 * Bulk add products under a brand.
 * Accepts rows in the shape [{ model, variant?, brand? }].
 * Returns per-row statuses so callers can safely retry.
 */
export async function addProductsBulk({
  config,
  category,
  brand = '',
  rows = [],
  storage = null,
  specDb = null,
  appDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  const defaultBrand = String(brand ?? '').trim();
  const inputRows = Array.isArray(rows) ? rows : [];

  if (!cat) return { ok: false, error: 'category_required' };
  if (!defaultBrand) return { ok: false, error: 'brand_required' };
  if (inputRows.length === 0) {
    return {
      ok: true,
      total: 0,
      created: 0,
      skipped_existing: 0,
      skipped_duplicate: 0,
      invalid: 0,
      failed: 0,
      total_catalog: 0,
      results: []
    };
  }

  // WHY: SQL is the sole SSOT — build dedup set from specDb, not catalog JSON.
  const allProducts = specDb?.getAllProducts?.() || [];
  const seenInRequest = new Set();
  const results = [];

  let created = 0;
  let skippedExisting = 0;
  let skippedDuplicate = 0;
  let invalid = 0;
  let failed = 0;

  for (let i = 0; i < inputRows.length; i += 1) {
    const row = inputRows[i] && typeof inputRows[i] === 'object' ? inputRows[i] : {};
    const rowBrand = String(row.brand ?? defaultBrand).trim();
    const rowBaseModel = String(row.base_model ?? '').trim();
    const rowVariant = String(row.variant ?? '').trim();
    const baseResult = {
      index: i,
      brand: rowBrand,
      base_model: rowBaseModel,
      model: rowBaseModel,
      variant: rowVariant
    };

    if (!rowBrand) {
      invalid += 1;
      results.push({ ...baseResult, status: 'invalid', reason: 'brand_required' });
      continue;
    }
    if (!rowBaseModel) {
      invalid += 1;
      results.push({ ...baseResult, status: 'invalid', reason: 'model_required' });
      continue;
    }

    const identity = normalizeProductIdentity(cat, rowBrand, rowBaseModel, rowVariant);
    const identityKey = `${identity.brand.toLowerCase()}||${identity.base_model.toLowerCase()}||${identity.variant.toLowerCase()}`;
    const normalizedResult = {
      ...baseResult,
      brand: identity.brand,
      model: identity.model,
      variant: identity.variant,
    };

    if (seenInRequest.has(identityKey)) {
      skippedDuplicate += 1;
      results.push({ ...normalizedResult, status: 'skipped_duplicate', reason: 'duplicate_in_request' });
      continue;
    }
    seenInRequest.add(identityKey);

    const existingRow = allProducts.find((r) =>
      String(r.brand || '').trim().toLowerCase() === identity.brand.toLowerCase() &&
      String(r.base_model || '').trim().toLowerCase() === identity.base_model.toLowerCase() &&
      String(r.variant || '').trim().toLowerCase() === identity.variant.toLowerCase()
    );
    if (existingRow) {
      skippedExisting += 1;
      results.push({ ...normalizedResult, productId: existingRow.product_id, status: 'skipped_existing', reason: 'already_exists' });
      continue;
    }

    const pid = buildProductId(cat);
    normalizedResult.productId = pid;

    const product = {
      identifier: generateIdentifier(),
      brand: identity.brand,
      base_model: identity.base_model,
      model: identity.model,
      variant: identity.variant,
      brand_identifier: resolveBrandIdentifier(appDb, identity.brand),
      status: 'active',
      added_at: nowIso(),
      added_by: 'gui_bulk'
    };

    try {
      try {
        writeProductIdentity({
          productId: pid,
          category: cat,
          identity: { brand: identity.brand, base_model: identity.base_model, model: identity.model, variant: identity.variant, brand_identifier: product.brand_identifier },
          identifier: product.identifier,
        });
      } catch { /* best-effort */ }

      created += 1;
      results.push({ ...normalizedResult, ...product, status: 'created' });
    } catch (error) {
      failed += 1;
      results.push({
        ...normalizedResult,
        status: 'failed',
        reason: String(error?.message || error || 'bulk_add_failed')
      });
    }
  }

  return {
    ok: true,
    total: inputRows.length,
    created,
    skipped_existing: skippedExisting,
    skipped_duplicate: skippedDuplicate,
    invalid,
    failed,
    total_catalog: allProducts.length + created,
    results
  };
}

/**
 * Update a product. Patches provided fields.
 * ProductId is immutable — identity changes (brand/base_model/variant) update metadata only.
 */
export async function updateProduct({
  config,
  category,
  productId,
  patch = {},
  storage = null,
  specDb = null,
  appDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return { ok: false, error: 'category_required' };
  if (!productId) return { ok: false, error: 'product_id_required' };

  // WHY: SQL is the sole SSOT — look up existing product from specDb.
  const existingRow = specDb?.getAllProducts?.().find(r => r.product_id === productId) || null;
  if (!existingRow) {
    return { ok: false, error: 'product_not_found', productId };
  }

  // Apply patches — base_model is the primary field, model is derived.
  const newBrand = patch.brand !== undefined ? String(patch.brand).trim() : existingRow.brand;
  const newBaseModel = patch.base_model !== undefined
    ? String(patch.base_model).trim()
    : existingRow.base_model;
  const newVariant = patch.variant !== undefined ? String(patch.variant).trim() : existingRow.variant;

  const updatedStatus = patch.status !== undefined ? patch.status : (existingRow.status || 'active');

  // WHY: Normalize identity (strip fabricated variants) but productId stays immutable
  const identity = normalizeProductIdentity(cat, newBrand, newBaseModel, newVariant);

  // WHY: Resolve brand_identifier when brand changes; preserve existing otherwise
  const newBrandIdentifier = patch.brand !== undefined
    ? resolveBrandIdentifier(appDb, identity.brand)
    : (existingRow.brand_identifier || '');

  const updated = {
    identifier: existingRow.identifier || '',
    brand: identity.brand,
    base_model: identity.base_model,
    model: identity.model,
    variant: identity.variant,
    brand_identifier: newBrandIdentifier,
    status: updatedStatus,
    updated_at: nowIso()
  };

  return { ok: true, productId, product: updated };
}

/**
 * Remove a product. Deletes catalog entry + input file + queue entry.
 * Output files are preserved (they may be useful for reference).
 */
export async function removeProduct({
  config,
  category,
  productId,
  storage = null,
  removeQueue = null,
  specDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return { ok: false, error: 'category_required' };
  if (!productId) return { ok: false, error: 'product_id_required' };

  // WHY: SQL is the sole SSOT — check existence from specDb.
  const existingRow = specDb?.getAllProducts?.().find(r => r.product_id === productId) || null;
  if (!existingRow) {
    return { ok: false, error: 'product_not_found', productId };
  }

  if (removeQueue) {
    await removeQueue({ storage, category: cat, productId });
  }

  return { ok: true, productId, removed: true };
}

/**
 * List products from SQL (the live SSOT).
 */
export function listProducts({ specDb }) {
  if (!specDb) return [];
  const rows = specDb.getAllProducts() || [];
  return rows.map((row) => ({
    productId: row.product_id,
    id: row.id || 0,
    identifier: String(row.identifier || '').trim(),
    brand: String(row.brand || '').trim(),
    brand_identifier: String(row.brand_identifier || '').trim(),
    base_model: String(row.base_model || '').trim(),
    model: String(row.model || '').trim(),
    variant: String(row.variant || '').trim(),
    status: row.status || 'active',
    added_at: row.created_at || '',
    added_by: '',
  })).sort((a, b) =>
    a.brand.localeCompare(b.brand) ||
    a.base_model.localeCompare(b.base_model) ||
    (a.variant || '').localeCompare(b.variant || '')
  );
}

