/**
 * Product Catalog — per-category product management.
 *
 * SSOT: SQL products table (spec.sqlite). product_catalog.json is a read-only boot seed.
 * Per-product rebuild file: .workspace/products/{pid}/product.json (writeProductIdentity).
 *
 * CRUD writes to SQL via upsertCatalogProductRow (called from catalogRoutes.js).
 * No fixture files, no catalog JSON mutation.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeProductIdentity } from '../identity/identityDedup.js';
import { loadCatalogProducts, loadCatalogProductsWithFields } from './catalogProductLoader.js';
import { generateIdentifier, nextAvailableId } from '../identity/productIdentity.js';
import { writeProductIdentity } from './writeProductIdentity.js';
import { buildProductId } from '../../../shared/primitives.js';
import { migrateProductArtifacts, appendRenameLog } from '../migrations/artifactMigration.js';
import { buildUserFieldOverrideCandidateId } from '../../../utils/candidateIdentifier.js';

function catalogPath(config, category) {
  const root = config?.categoryAuthorityRoot || 'category_authority';
  return path.resolve(root, category, '_control_plane', 'product_catalog.json');
}

function nowIso() {
  return new Date().toISOString();
}

function emptyCatalog() {
  return {
    _doc: 'Per-category product catalog. Managed by GUI.',
    _version: 1,
    products: {}
  };
}

// WHY: With decoupled productIds (random hex), duplicate detection must be
// identity-based, not ID-based. Returns the existing productId or null.
function findProductByIdentity(catalog, brand, model, variant) {
  const b = String(brand ?? '').trim().toLowerCase();
  const m = String(model ?? '').trim().toLowerCase();
  const v = String(variant ?? '').trim().toLowerCase();
  for (const [pid, p] of Object.entries(catalog.products || {})) {
    if (String(p.brand ?? '').trim().toLowerCase() === b &&
        String(p.model ?? '').trim().toLowerCase() === m &&
        String(p.variant ?? '').trim().toLowerCase() === v) {
      return pid;
    }
  }
  return null;
}

// ── Load / Save ───────────────────────────────────────────────────

export async function loadProductCatalog(config, category) {
  const filePath = catalogPath(config, category);
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.products) {
      return emptyCatalog();
    }
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return emptyCatalog();
    }
    throw err;
  }
}

// WHY: saveProductCatalog removed — product_catalog.json is a read-only boot seed.
// SQL products table is the live SSOT. CRUD writes go through upsertCatalogProductRow
// in catalogRoutes.js. Per-product rebuild file is .workspace/products/{pid}/product.json.

// ── CRUD ──────────────────────────────────────────────────────────

/**
 * Add a product. Creates catalog entry + input file + queue entry.
 * Returns { ok, productId, product } or { ok: false, error }.
 */
export async function addProduct({
  config,
  category,
  brand,
  model,
  variant = '',
  seedUrls = [],
  storage = null,
  upsertQueue = null,
  specDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  const cleanBrand = String(brand ?? '').trim();
  const cleanModel = String(model ?? '').trim();

  if (!cat) return { ok: false, error: 'category_required' };
  if (!cleanBrand) return { ok: false, error: 'brand_required' };
  if (!cleanModel) return { ok: false, error: 'model_required' };

  // Normalize identity (strips fabricated variants)
  const identity = normalizeProductIdentity(cat, cleanBrand, cleanModel, variant);

  // WHY: Check SQL first (live SSOT), fall back to catalog JSON (boot seed)
  let existingPid = null;
  if (specDb) {
    const allProducts = specDb.getAllProducts?.() || [];
    existingPid = allProducts.find((r) =>
      String(r.brand || '').trim().toLowerCase() === identity.brand.toLowerCase() &&
      String(r.model || '').trim().toLowerCase() === identity.model.toLowerCase() &&
      String(r.variant || '').trim().toLowerCase() === identity.variant.toLowerCase()
    )?.product_id || null;
  }
  if (!existingPid) {
    const catalog = await loadProductCatalog(config, cat);
    existingPid = findProductByIdentity(catalog, identity.brand, identity.model, identity.variant);
  }
  if (existingPid) {
    return { ok: false, error: 'product_already_exists', productId: existingPid };
  }

  const catalog = await loadProductCatalog(config, cat);
  const pid = buildProductId(cat);

  const product = {
    id: nextAvailableId(catalog),
    identifier: generateIdentifier(),
    brand: identity.brand,
    model: identity.model,
    variant: identity.variant,
    status: 'active',
    seed_urls: Array.isArray(seedUrls) ? seedUrls.filter(Boolean) : [],
    added_at: nowIso(),
    added_by: 'gui'
  };

  // WHY: Write the rebuild SSOT product.json at .workspace/products/{pid}/
  try {
    writeProductIdentity({
      productId: pid,
      category: cat,
      identity: { brand: identity.brand, model: identity.model, variant: identity.variant },
      seedUrls,
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
 * Accepts rows in the shape [{ model, variant?, brand?, seedUrls? }].
 * Returns per-row statuses so callers can safely retry.
 */
export async function addProductsBulk({
  config,
  category,
  brand = '',
  rows = [],
  storage = null,
  upsertQueue = null
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  const defaultBrand = String(brand ?? '').trim();
  const inputRows = Array.isArray(rows) ? rows : [];

  if (!cat) return { ok: false, error: 'category_required' };
  if (!defaultBrand) return { ok: false, error: 'brand_required' };
  if (inputRows.length === 0) {
    const catalog = await loadProductCatalog(config, cat);
    return {
      ok: true,
      total: 0,
      created: 0,
      skipped_existing: 0,
      skipped_duplicate: 0,
      invalid: 0,
      failed: 0,
      total_catalog: Object.keys(catalog.products || {}).length,
      results: []
    };
  }

  const catalog = await loadProductCatalog(config, cat);
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
    const rowModel = String(row.model ?? '').trim();
    const rowVariant = String(row.variant ?? '').trim();
    const seedUrls = Array.isArray(row.seedUrls) ? row.seedUrls.filter(Boolean) : [];
    const baseResult = {
      index: i,
      brand: rowBrand,
      model: rowModel,
      variant: rowVariant
    };

    if (!rowBrand) {
      invalid += 1;
      results.push({ ...baseResult, status: 'invalid', reason: 'brand_required' });
      continue;
    }
    if (!rowModel) {
      invalid += 1;
      results.push({ ...baseResult, status: 'invalid', reason: 'model_required' });
      continue;
    }

    const identity = normalizeProductIdentity(cat, rowBrand, rowModel, rowVariant);
    const identityKey = `${identity.brand.toLowerCase()}||${identity.model.toLowerCase()}||${identity.variant.toLowerCase()}`;
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

    const existingPid = findProductByIdentity(catalog, identity.brand, identity.model, identity.variant);
    if (existingPid) {
      skippedExisting += 1;
      results.push({ ...normalizedResult, productId: existingPid, status: 'skipped_existing', reason: 'already_exists' });
      continue;
    }

    const pid = buildProductId(cat);
    normalizedResult.productId = pid;

    const product = {
      id: nextAvailableId(catalog),
      identifier: generateIdentifier(),
      brand: identity.brand,
      model: identity.model,
      variant: identity.variant,
      status: 'active',
      seed_urls: seedUrls,
      added_at: nowIso(),
      added_by: 'gui_bulk'
    };

    try {
      catalog.products[pid] = product;

      try {
        writeProductIdentity({
          productId: pid,
          category: cat,
          identity: { brand: identity.brand, model: identity.model, variant: identity.variant },
          seedUrls,
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
      delete catalog.products[pid];
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
    total_catalog: Object.keys(catalog.products || {}).length,
    results
  };
}

/**
 * Update a product. Patches provided fields.
 * ProductId is immutable — identity changes (brand/model/variant) update metadata only.
 */
export async function updateProduct({
  config,
  category,
  productId,
  patch = {},
  storage = null,
  upsertQueue = null,
  specDb = null,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return { ok: false, error: 'category_required' };
  if (!productId) return { ok: false, error: 'product_id_required' };

  const catalog = await loadProductCatalog(config, cat);
  const existing = catalog.products[productId];
  if (!existing) {
    return { ok: false, error: 'product_not_found', productId };
  }

  // Apply patches
  const newBrand = patch.brand !== undefined ? String(patch.brand).trim() : existing.brand;
  const newModel = patch.model !== undefined ? String(patch.model).trim() : existing.model;
  const newVariant = patch.variant !== undefined ? String(patch.variant).trim() : existing.variant;

  if (patch.seed_urls !== undefined) {
    existing.seed_urls = Array.isArray(patch.seed_urls) ? patch.seed_urls.filter(Boolean) : existing.seed_urls;
  }
  if (patch.status !== undefined) {
    existing.status = patch.status;
  }

  // WHY: Normalize identity (strip fabricated variants) but productId stays immutable
  const identity = normalizeProductIdentity(cat, newBrand, newModel, newVariant);

  const updated = {
    ...existing,
    brand: identity.brand,
    model: identity.model,
    variant: identity.variant,
    updated_at: nowIso()
  };

  catalog.products[productId] = updated;

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
  removeQueue = null
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return { ok: false, error: 'category_required' };
  if (!productId) return { ok: false, error: 'product_id_required' };

  const catalog = await loadProductCatalog(config, cat);
  if (!catalog.products[productId]) {
    return { ok: false, error: 'product_not_found', productId };
  }

  delete catalog.products[productId];

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
 * @param {string} opts.mode - 'identity' (default): brand/model/variant only.
 *                             'full': also imports field values as overrides with confidence 0.99.
 */
export async function seedFromCatalog({
  config,
  category,
  mode = 'identity',
  storage = null,
  upsertQueue = null
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

  const catalog = await loadProductCatalog(config, cat);
  let seeded = 0;
  let skipped = 0;
  let fieldsImported = 0;

  for (const row of products) {
    const brand = String(row.brand ?? '').trim();
    const model = String(row.model ?? '').trim();
    const rawVariant = String(row.variant ?? '').trim();

    if (!brand || !model) continue;

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

    const identity = normalizeProductIdentity(cat, brand, model, rawVariant);
    // WHY: Prefer productId from catalog loader (preserves existing ID on re-seed),
    // then identity lookup, then generate new hex ID only for truly new products.
    const foundByIdentity = findProductByIdentity(catalog, identity.brand, identity.model, identity.variant);
    const pid = row.productId || foundByIdentity || buildProductId(cat);

    const isExisting = Boolean(row.productId || foundByIdentity);
    if (isExisting && !isFullMode) {
      skipped += 1;
      continue;
    }

    if (!isExisting) {
      catalog.products[pid] = {
        id: nextAvailableId(catalog),
        identifier: generateIdentifier(),
        brand: identity.brand,
        model: identity.model,
        variant: identity.variant,
        status: 'active',
        seed_urls: [],
        added_at: nowIso(),
        added_by: isFullMode ? 'catalog_import' : 'seed'
      };
    }

    // WHY: Write product.json for new products (rebuild SSOT)
    if (!isExisting) {
      try {
        const catEntry = catalog.products[pid];
        writeProductIdentity({
          productId: pid,
          category: cat,
          identity: { brand: identity.brand, model: identity.model, variant: identity.variant },
          identifier: catEntry.identifier,
        });
      } catch { /* best-effort */ }
    }

    // Full mode: write field value overrides (merge with existing, don't overwrite manual edits)
    if (isFullMode && row.canonical_fields && Object.keys(row.canonical_fields).length > 0) {
      const overrideDir = path.resolve(config?.categoryAuthorityRoot || 'category_authority', cat, '_overrides');
      await fs.mkdir(overrideDir, { recursive: true });
      const overridePath = path.join(overrideDir, `${pid}.overrides.json`);
      const setAt = nowIso();

      // Load existing override file if updating an existing product
      let existingOverrideFile = null;
      if (isExisting) {
        try { existingOverrideFile = JSON.parse(await fs.readFile(overridePath, 'utf8')); } catch { /* no existing overrides */ }
      }
      const existingOverrides = existingOverrideFile?.overrides || {};

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
        const overrideFile = {
          version: 1,
          category: cat,
          product_id: pid,
          created_at: existingOverrideFile?.created_at || setAt,
          review_started_at: existingOverrideFile?.review_started_at || setAt,
          review_status: 'in_progress',
          updated_at: setAt,
          overrides
        };
        await fs.writeFile(overridePath, JSON.stringify(overrideFile, null, 2), 'utf8');
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
    total: Object.keys(catalog.products).length,
    fields_imported: fieldsImported
  };
}

/**
 * List products from catalog.
 */
export async function listProducts(config, category) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return [];

  const catalog = await loadProductCatalog(config, cat);

  return Object.entries(catalog.products)
    .map(([pid, p]) => ({ productId: pid, ...p }))
    .sort((a, b) =>
      a.brand.localeCompare(b.brand) ||
      a.model.localeCompare(b.model) ||
      (a.variant || '').localeCompare(b.variant || '')
    );
}

