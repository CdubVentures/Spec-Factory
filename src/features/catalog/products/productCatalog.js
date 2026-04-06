/**
 * Product Catalog — per-category product management.
 *
 * SSOT: product.json per product (.workspace/products/{pid}/product.json).
 * SQL products table is the runtime cache, rebuilt from product.json via scanAndSeedCheckpoints.
 * CRUD writes to SQL via upsertCatalogProductRow (called from catalogRoutes.js).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeProductIdentity, deriveFullModel } from '../identity/identityDedup.js';
import { loadCatalogProducts, loadCatalogProductsWithFields } from './catalogProductLoader.js';
import { generateIdentifier } from '../identity/productIdentity.js';
import { writeProductIdentity } from './writeProductIdentity.js';
import { buildProductId } from '../../../shared/primitives.js';
import { buildUserFieldOverrideCandidateId } from '../../../utils/candidateIdentifier.js';
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
  upsertQueue = null,
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

  // WHY: SQL is the sole SSOT for products. product_catalog.json is retired.
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

  // Upsert queue entry
  if (upsertQueue) {
    await upsertQueue({ storage, category: cat, productId: pid, s3key: '', patch: { status: 'pending', next_action_hint: 'fast_pass' } });
  }

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
  upsertQueue = null,
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

      if (upsertQueue) {
        await upsertQueue({
          storage,
          category: cat,
          productId: pid,
          s3key: '',
          patch: { status: 'pending', next_action_hint: 'fast_pass' }
        });
      }

      created += 1;
      results.push({ ...normalizedResult, status: 'created' });
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
  upsertQueue = null,
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

  if (upsertQueue) {
    await upsertQueue({ storage, category: cat, productId, s3key: '', patch: { status: 'pending' }, specDb });
  }

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
 * Seed catalog from app-owned product docs.
 * Reads products (and optionally field values) from control-plane catalog and
 * per-product overrides. Imports products that do not yet exist in catalog.
 *
 * @param {object} opts
 * @param {string} opts.mode - 'identity' (default): brand/base_model/variant only.
 *                             'full': also imports field values as overrides with confidence 0.99.
 */
export async function seedFromCatalog({
  config,
  category,
  mode = 'identity',
  storage = null,
  upsertQueue = null,
  specDb = null,
  appDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return { ok: false, error: 'category_required' };

  const isFullMode = mode === 'full';
  const products = isFullMode
    ? await loadCatalogProductsWithFields({ category: cat, config })
    : await loadCatalogProducts({ category: cat, config });

  if (!products || products.length === 0) {
    return { ok: true, seeded: 0, skipped: 0, total: 0, fields_imported: 0, message: 'no_catalog_data' };
  }

  // WHY: SQL is the sole SSOT — build dedup set from specDb, not catalog JSON.
  const allProducts = specDb?.getAllProducts?.() || [];
  let seeded = 0;
  let skipped = 0;
  let fieldsImported = 0;

  for (const row of products) {
    const brand = String(row.brand ?? '').trim();
    const model = String(row.model ?? '').trim();
    const baseModel = String(row.base_model ?? '').trim();
    const rawVariant = String(row.variant ?? '').trim();

    if (!brand || !baseModel) continue;

    // In full mode, skip products with brand+model but zero data fields
    if (isFullMode) {
      const fieldCount = row.canonical_fields
        ? Object.keys(row.canonical_fields).length
        : 0;
      if (fieldCount === 0) {
        skipped += 1;
        continue;
      }
    }

    const identity = normalizeProductIdentity(cat, brand, baseModel, rawVariant);
    // WHY: Prefer productId from catalog loader (preserves existing ID on re-seed),
    // then identity lookup from SQL, then generate new hex ID only for truly new products.
    const foundByIdentity = allProducts.find((r) =>
      String(r.brand || '').trim().toLowerCase() === identity.brand.toLowerCase() &&
      String(r.base_model || '').trim().toLowerCase() === identity.base_model.toLowerCase() &&
      String(r.variant || '').trim().toLowerCase() === identity.variant.toLowerCase()
    )?.product_id || null;
    const pid = row.productId || foundByIdentity || buildProductId(cat);

    const isExisting = Boolean(row.productId || foundByIdentity);
    if (isExisting && !isFullMode) {
      skipped += 1;
      continue;
    }

    // WHY: Write product.json for new products (rebuild SSOT)
    const newIdentifier = generateIdentifier();
    const newBrandIdentifier = row.brand_identifier || resolveBrandIdentifier(appDb, identity.brand);
    if (!isExisting) {
      try {
        writeProductIdentity({
          productId: pid,
          category: cat,
          identity: { brand: identity.brand, base_model: identity.base_model, model: identity.model, variant: identity.variant, brand_identifier: newBrandIdentifier },
          identifier: newIdentifier,
        });
      } catch { /* best-effort */ }
    }

    // Full mode: write field value overrides (merge with existing, don't overwrite manual edits)
    if (isFullMode && row.canonical_fields && Object.keys(row.canonical_fields).length > 0) {
      const { readProductFromConsolidated, upsertProductInConsolidated } = await import('../../../shared/consolidatedOverrides.js');
      const setAt = nowIso();

      // WHY: Overlap 0d — read existing from consolidated JSON SSOT
      const existingEntry = await readProductFromConsolidated({ config, category: cat, productId: pid });
      const existingOverrides = existingEntry?.overrides || {};

      const overrides = { ...existingOverrides };
      for (const [field, value] of Object.entries(row.canonical_fields)) {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) continue;
        // Don't overwrite manual user edits (only replace catalog imports or missing entries)
        const prev = existingOverrides[field];
        const prevSource = String(prev?.override_source || '').trim();
        const replaceableImportSource = prevSource === 'catalog_import' || prevSource.endsWith('_import');
        if (prev && !replaceableImportSource) continue;
        overrides[field] = {
          field,
          override_source: 'catalog_import',
          candidate_index: null,
          override_value: trimmed,
          override_reason: 'Imported from catalog',
          override_provenance: null,
          overridden_by: null,
          overridden_at: setAt,
          validated: null,
          candidate_id: buildUserFieldOverrideCandidateId({
            productId: pid,
            fieldKey: field,
            value: trimmed,
          }),
          value: trimmed,
          confidence: 0.99,
          source: {
            host: 'catalog.local',
            source_id: null,
            method: 'catalog_import',
            tier: 1,
            evidence_key: null
          },
          set_at: setAt
        };
        fieldsImported += 1;
      }
      if (Object.keys(overrides).length > 0) {
        const overrideEntry = {
          category: cat,
          product_id: pid,
          created_at: existingEntry?.created_at || setAt,
          review_started_at: existingEntry?.review_started_at || setAt,
          review_status: 'in_progress',
          updated_at: setAt,
          overrides
        };
        await upsertProductInConsolidated({ config, category: cat, productId: pid, productEntry: overrideEntry });
      }
    }

    if (!isExisting) seeded += 1;

    // Upsert queue
    if (upsertQueue) {
      await upsertQueue({ storage, category: cat, productId: pid, s3key: '', patch: { status: 'pending', next_action_hint: 'fast_pass' } });
    }
  }

  return {
    ok: true,
    seeded,
    skipped,
    total: allProducts.length + seeded,
    fields_imported: fieldsImported
  };
}

/**
 * List products from SQL (the live SSOT).
 * JSON catalog is only read at seed/rebuild time.
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

