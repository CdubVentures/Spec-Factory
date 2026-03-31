/**
 * Brand Registry — global brand management across all categories.
 *
 * Stored in: app.sqlite (brands + brand_categories + brand_renames tables)
 * Managed by: GUI Brand Manager tab + API
 *
 * A brand is global — it can belong to multiple categories (e.g. Razer → mouse, keyboard, headset).
 * The registry is the single source for brand names, aliases, and category assignments.
 *
 * All brand state is persisted via appDb (SQL). JSON files are seed-only archives.
 */

import { slugify } from './slugify.js';
import { loadCatalogProducts, discoverCategoriesLocal } from '../products/catalogProductLoader.js';
import { generateIdentifier } from './productIdentity.js';
import { loadProductCatalog } from '../products/productCatalog.js';

function nowIso() {
  return new Date().toISOString();
}

// WHY: Maps an SQL brands row + categories array into the shape the HTTP API returns.
function sqlBrandToApiShape(row, categories) {
  return {
    slug: row.slug,
    canonical_name: row.canonical_name,
    identifier: row.identifier,
    aliases: JSON.parse(row.aliases || '[]'),
    categories,
    website: row.website || '',
    added_at: row.created_at,
    added_by: row.added_by,
    ...(row.updated_at && row.updated_at !== row.created_at ? { updated_at: row.updated_at } : {}),
  };
}

/**
 * Load the brand registry. Reconstructs the legacy shape from SQL.
 * Returns { _doc, _version, brands: { slug: brandObj } }.
 */
export async function loadBrandRegistry(config, { appDb } = {}) {
  if (!appDb) throw new Error('appDb is required for loadBrandRegistry');
  const rows = appDb.listBrands();
  const brands = {};
  for (const row of rows) {
    const categories = appDb.getCategoriesForBrand(row.identifier);
    brands[row.slug] = sqlBrandToApiShape(row, categories);
  }
  return { _doc: 'Global brand registry. Managed by GUI.', _version: 1, brands };
}

/**
 * Add a new brand. Returns { ok, slug, brand } or { ok: false, error }.
 */
export async function addBrand({ config, appDb, name, aliases = [], categories = [], website = '' }) {
  const trimmedName = String(name ?? '').trim();
  if (!trimmedName) return { ok: false, error: 'brand_name_required' };

  const brandSlug = slugify(trimmedName);
  if (!brandSlug) return { ok: false, error: 'brand_name_invalid' };

  const existing = appDb.getBrandBySlug(brandSlug);
  if (existing) return { ok: false, error: 'brand_already_exists', slug: brandSlug };

  const cleanAliases = (Array.isArray(aliases) ? aliases : [])
    .map((a) => String(a).trim())
    .filter(Boolean);
  const cleanCategories = (Array.isArray(categories) ? categories : [])
    .map((c) => String(c).trim().toLowerCase())
    .filter(Boolean);

  const identifier = generateIdentifier();
  appDb.upsertBrand({
    identifier,
    canonical_name: trimmedName,
    slug: brandSlug,
    aliases: JSON.stringify(cleanAliases),
    website: String(website ?? '').trim(),
    added_by: 'gui',
  });
  if (cleanCategories.length > 0) {
    appDb.setBrandCategories(identifier, cleanCategories);
  }

  const brand = {
    canonical_name: trimmedName,
    identifier,
    aliases: cleanAliases,
    categories: cleanCategories,
    website: String(website ?? '').trim(),
    added_at: nowIso(),
    added_by: 'gui',
  };

  return { ok: true, slug: brandSlug, brand };
}

/**
 * Bulk add brands from a single-column list.
 */
export async function addBrandsBulk({ config, appDb, names = [], category = '' }) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat || cat === 'all') return { ok: false, error: 'category_required' };

  const rows = Array.isArray(names) ? names : [];
  const seenInRequest = new Set();
  const results = [];
  let created = 0;
  let skippedExisting = 0;
  let skippedDuplicate = 0;
  let invalid = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rawName = String(rows[i] ?? '').trim();
    const baseResult = { index: i, name: rawName, slug: '' };

    if (!rawName) {
      invalid += 1;
      results.push({ ...baseResult, status: 'invalid', reason: 'brand_name_required' });
      continue;
    }

    const brandSlug = slugify(rawName);
    if (!brandSlug) {
      invalid += 1;
      results.push({ ...baseResult, status: 'invalid', reason: 'brand_name_invalid' });
      continue;
    }

    const normalizedResult = { ...baseResult, slug: brandSlug };
    if (seenInRequest.has(brandSlug)) {
      skippedDuplicate += 1;
      results.push({ ...normalizedResult, status: 'skipped_duplicate', reason: 'duplicate_in_request' });
      continue;
    }
    seenInRequest.add(brandSlug);

    const existing = appDb.getBrandBySlug(brandSlug);
    if (existing) {
      const currentCats = appDb.getCategoriesForBrand(existing.identifier);
      const hadCategory = currentCats.includes(cat);
      if (!hadCategory) {
        appDb.setBrandCategories(existing.identifier, [...new Set([...currentCats, cat])].sort());
      }
      skippedExisting += 1;
      results.push({
        ...normalizedResult,
        status: 'skipped_existing',
        reason: hadCategory ? 'already_exists' : 'category_added',
      });
      continue;
    }

    const identifier = generateIdentifier();
    appDb.upsertBrand({
      identifier,
      canonical_name: rawName,
      slug: brandSlug,
      aliases: '[]',
      website: '',
      added_by: 'gui_bulk',
    });
    appDb.setBrandCategories(identifier, [cat]);
    created += 1;
    results.push({ ...normalizedResult, status: 'created' });
  }

  return {
    ok: true,
    total: rows.length,
    created,
    skipped_existing: skippedExisting,
    skipped_duplicate: skippedDuplicate,
    invalid,
    failed: 0,
    total_brands: appDb.listBrands().length,
    results,
  };
}

/**
 * Update an existing brand. Only patches provided fields.
 */
export async function updateBrand({ config, appDb, slug, patch = {} }) {
  const brandSlug = String(slug ?? '').trim();
  if (!brandSlug) return { ok: false, error: 'slug_required' };

  const existing = appDb.getBrandBySlug(brandSlug);
  if (!existing) return { ok: false, error: 'brand_not_found', slug: brandSlug };

  const updates = {};
  if (patch.name !== undefined) {
    updates.canonical_name = String(patch.name).trim();
  }
  if (patch.aliases !== undefined) {
    const cleanAliases = (Array.isArray(patch.aliases) ? patch.aliases : [])
      .map((a) => String(a).trim())
      .filter(Boolean);
    updates.aliases = JSON.stringify(cleanAliases);
  }
  if (patch.website !== undefined) {
    updates.website = String(patch.website).trim();
  }

  if (Object.keys(updates).length > 0) {
    appDb.updateBrandFields(existing.identifier, updates);
  }

  if (patch.categories !== undefined) {
    const cleanCategories = (Array.isArray(patch.categories) ? patch.categories : [])
      .map((c) => String(c).trim().toLowerCase())
      .filter(Boolean);
    appDb.setBrandCategories(existing.identifier, cleanCategories);
  }

  const updated = appDb.getBrand(existing.identifier);
  const categories = appDb.getCategoriesForBrand(existing.identifier);
  return { ok: true, slug: brandSlug, brand: sqlBrandToApiShape(updated, categories) };
}

/**
 * Remove a brand from the registry.
 */
export async function removeBrand({ config, appDb, slug, force = false }) {
  const brandSlug = String(slug ?? '').trim();
  if (!brandSlug) return { ok: false, error: 'slug_required' };

  const brand = appDb.getBrandBySlug(brandSlug);
  if (!brand) return { ok: false, error: 'brand_not_found', slug: brandSlug };

  const categories = appDb.getCategoriesForBrand(brand.identifier);
  const productsByCategory = {};
  let totalProducts = 0;
  for (const category of categories) {
    const catalog = await loadProductCatalog(config, category);
    const count = Object.values(catalog.products || {})
      .filter((row) => row.brand === brand.canonical_name).length;
    productsByCategory[category] = count;
    totalProducts += count;
  }

  if (totalProducts > 0 && !force) {
    return {
      ok: false,
      error: 'brand_in_use',
      slug: brandSlug,
      warning: `${totalProducts} products reference this brand`,
      total_products: totalProducts,
      products_by_category: productsByCategory,
    };
  }

  appDb.deleteBrand(brand.identifier);

  return {
    ok: true,
    slug: brandSlug,
    removed: true,
    total_products: totalProducts,
    products_by_category: productsByCategory,
  };
}

/**
 * Get all brands for a specific category.
 */
export function getBrandsForCategory(appDb, category) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return [];
  const rows = appDb.listBrandsForCategory(cat);
  return rows.map((row) => {
    const categories = appDb.getCategoriesForBrand(row.identifier);
    return sqlBrandToApiShape(row, categories);
  });
}

/**
 * Find a brand by name or alias. Returns brand shape or null.
 */
export function findBrandByAlias(appDb, query) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  const row = appDb.findBrandByAlias(q);
  if (!row) return null;
  const categories = appDb.getCategoriesForBrand(row.identifier);
  return sqlBrandToApiShape(row, categories);
}

/**
 * Seed brands from activeFiltering data.
 */
export async function seedBrandsFromActiveFiltering({ config, appDb, category = 'all', extraCategories = [] }) {
  const root = config?.categoryAuthorityRoot || 'category_authority';
  const cat = String(category ?? '').trim().toLowerCase();
  const categories = cat && cat !== 'all'
    ? [cat]
    : [...new Set([...(await discoverCategoriesLocal({ categoryAuthorityRoot: root })), ...extraCategories])].sort();

  if (categories.length === 0) {
    return { ok: true, seeded: 0, skipped: 0, categories_scanned: 0, total_brands: 0 };
  }

  const brandMap = new Map();
  for (const categoryName of categories) {
    const catalog = await loadProductCatalog(config, categoryName);
    for (const row of Object.values(catalog.products || {})) {
      const brandName = String(row?.brand ?? '').trim();
      if (!brandName) continue;
      const brandSlug = slugify(brandName);
      if (!brandSlug) continue;
      if (!brandMap.has(brandSlug)) brandMap.set(brandSlug, { canonical: brandName, cats: new Set() });
      brandMap.get(brandSlug).cats.add(categoryName);
    }
  }

  let seeded = 0;
  let skipped = 0;
  for (const [brandSlug, { canonical, cats: brandCats }] of brandMap.entries()) {
    const existing = appDb.getBrandBySlug(brandSlug);
    if (existing) {
      const currentCats = appDb.getCategoriesForBrand(existing.identifier);
      const merged = [...new Set([...currentCats, ...brandCats])].sort();
      appDb.setBrandCategories(existing.identifier, merged);
      skipped += 1;
      continue;
    }
    const identifier = generateIdentifier();
    appDb.upsertBrand({
      identifier,
      canonical_name: canonical,
      slug: brandSlug,
      aliases: '[]',
      website: '',
      added_by: 'seed',
    });
    appDb.setBrandCategories(identifier, [...brandCats].sort());
    seeded += 1;
  }

  return {
    ok: true,
    seeded,
    skipped,
    categories_scanned: categories.length,
    total_brands: appDb.listBrands().length,
  };
}

/**
 * Seed brands from app-owned catalog data.
 */
export async function seedBrandsFromCatalog({ config, appDb, category = 'all', extraCategories = [] }) {
  const root = config?.categoryAuthorityRoot || 'category_authority';
  let targetCategories;
  const cat = String(category ?? '').trim().toLowerCase();
  if (cat && cat !== 'all') {
    targetCategories = [cat];
  } else {
    const localCats = await discoverCategoriesLocal({ categoryAuthorityRoot: root });
    targetCategories = [...new Set([...localCats, ...extraCategories])].sort();
  }

  if (targetCategories.length === 0) {
    return { ok: true, seeded: 0, skipped: 0, categories_scanned: 0, total_brands: 0 };
  }

  const brandMap = new Map();
  for (const categoryName of targetCategories) {
    const products = await loadCatalogProducts({ category: categoryName, config });
    if (!products || products.length === 0) continue;
    for (const row of products) {
      const brandName = String(row.brand ?? '').trim();
      if (!brandName) continue;
      const brandSlug = slugify(brandName);
      if (!brandSlug) continue;
      if (!brandMap.has(brandSlug)) brandMap.set(brandSlug, { canonical: brandName, cats: new Set() });
      brandMap.get(brandSlug).cats.add(categoryName);
    }
  }

  let seeded = 0;
  let skipped = 0;
  for (const [brandSlug, { canonical, cats: brandCats }] of brandMap) {
    const existing = appDb.getBrandBySlug(brandSlug);
    if (existing) {
      const currentCats = appDb.getCategoriesForBrand(existing.identifier);
      const merged = [...new Set([...currentCats, ...brandCats])].sort();
      appDb.setBrandCategories(existing.identifier, merged);
      skipped += 1;
      continue;
    }
    const identifier = generateIdentifier();
    appDb.upsertBrand({
      identifier,
      canonical_name: canonical,
      slug: brandSlug,
      aliases: '[]',
      website: '',
      added_by: 'seed',
    });
    appDb.setBrandCategories(identifier, [...brandCats].sort());
    seeded += 1;
  }

  return {
    ok: true,
    seeded,
    skipped,
    categories_scanned: targetCategories.length,
    total_brands: appDb.listBrands().length,
  };
}

/**
 * Rename a brand. Cascades slug/name changes to all product catalogs.
 *
 * @returns {{ ok, oldSlug, newSlug, identifier, oldName, newName, cascaded_products, cascade_failures, cascade_results[] }}
 */
export async function renameBrand({ config, appDb, slug, newName, storage, upsertQueue, getSpecDb = null }) {
  const oldSlug = String(slug ?? '').trim();
  if (!oldSlug) return { ok: false, error: 'slug_required' };

  const trimmedNew = String(newName ?? '').trim();
  if (!trimmedNew) return { ok: false, error: 'new_name_required' };

  const existing = appDb.getBrandBySlug(oldSlug);
  if (!existing) return { ok: false, error: 'brand_not_found', slug: oldSlug };

  const newSlug = slugify(trimmedNew);
  if (!newSlug) return { ok: false, error: 'new_name_invalid' };

  const oldCanonicalName = existing.canonical_name;

  if (newSlug !== oldSlug && appDb.getBrandBySlug(newSlug)) {
    return { ok: false, error: 'brand_already_exists', slug: newSlug };
  }

  // Update canonical name
  appDb.updateBrandFields(existing.identifier, { canonical_name: trimmedNew });

  // Move slug if changed
  if (newSlug !== oldSlug) {
    appDb.updateBrandSlug(existing.identifier, newSlug);
  }

  // Add old canonical name to aliases
  const currentAliases = JSON.parse(existing.aliases || '[]');
  if (!currentAliases.some((a) => a.toLowerCase() === oldCanonicalName.toLowerCase())) {
    appDb.updateBrandFields(existing.identifier, {
      aliases: JSON.stringify([...currentAliases, oldCanonicalName]),
    });
  }

  // Record rename in audit log
  appDb.insertBrandRename({
    identifier: existing.identifier,
    old_slug: oldSlug,
    new_slug: newSlug,
    old_name: oldCanonicalName,
    new_name: trimmedNew,
  });

  // WHY: Phase F — O(1) cascade via brand_identifier instead of per-product iteration.
  // Products with brand_identifier set get their display name updated in a single SQL UPDATE.
  const categories = appDb.getCategoriesForBrand(existing.identifier);
  const cascade_results = [];
  let cascaded_products = 0;
  let cascade_failures = 0;

  for (const category of categories) {
    const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
    if (specDb) {
      try {
        const db = specDb._db || specDb.db;
        const changes = db.prepare(
          'UPDATE products SET brand = ?, updated_at = datetime(\'now\') WHERE category = ? AND brand_identifier = ?'
        ).run(trimmedNew, category, existing.identifier).changes;
        cascade_results.push({ category, ok: true, updated: changes });
        cascaded_products += changes;
      } catch (err) {
        cascade_results.push({ category, ok: false, error: err.message || String(err) });
        cascade_failures++;
      }
    }
  }

  return {
    ok: cascade_failures === 0,
    oldSlug,
    newSlug,
    identifier: existing.identifier,
    oldName: oldCanonicalName,
    newName: trimmedNew,
    cascaded_products,
    cascade_failures,
    cascade_results,
  };
}

/**
 * Get impact analysis for a brand rename/delete.
 */
export async function getBrandImpactAnalysis({ config, appDb, slug }) {
  const brandSlug = String(slug ?? '').trim();
  if (!brandSlug) return { ok: false, error: 'slug_required' };

  const existing = appDb.getBrandBySlug(brandSlug);
  if (!existing) return { ok: false, error: 'brand_not_found', slug: brandSlug };

  const categories = appDb.getCategoriesForBrand(existing.identifier);
  const products_by_category = {};
  const product_details = {};
  let total_products = 0;

  for (const category of categories) {
    const catalog = await loadProductCatalog(config, category);
    const matched = Object.entries(catalog.products || {})
      .filter(([, p]) => p.brand === existing.canonical_name);
    products_by_category[category] = matched.length;
    product_details[category] = matched.map(([pid]) => pid);
    total_products += matched.length;
  }

  return {
    ok: true,
    slug: brandSlug,
    identifier: existing.identifier,
    canonical_name: existing.canonical_name,
    categories,
    products_by_category,
    product_details,
    total_products,
  };
}
