/**
 * Catalog Product Loader - reads products + field values from app-owned docs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanVariant, isFabricatedVariant } from '../identity/identityDedup.js';

function helperRootFromConfig(config = {}) {
  return path.resolve(String(config?.categoryAuthorityRoot || 'category_authority'));
}

function productCatalogPath({ category, config = {} }) {
  return path.join(
    helperRootFromConfig(config),
    String(category || '').trim().toLowerCase(),
    '_control_plane',
    'product_catalog.json'
  );
}

function overrideDirPath({ category, config = {} }) {
  return path.join(
    helperRootFromConfig(config),
    String(category || '').trim().toLowerCase(),
    '_overrides'
  );
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

function normalizeCatalogProducts(catalogDoc = {}) {
  const productsDoc = (catalogDoc && typeof catalogDoc === 'object' && !Array.isArray(catalogDoc))
    ? catalogDoc.products
    : null;
  if (!productsDoc || typeof productsDoc !== 'object' || Array.isArray(productsDoc)) {
    return [];
  }

  const rows = [];
  for (const [productId, row] of Object.entries(productsDoc)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue;
    }
    const brand = String(row.brand ?? '').trim();
    const model = String(row.model ?? '').trim();
    if (!brand || !model) {
      continue;
    }
    // WHY: Defense-in-depth — strip fabricated variants at read boundary.
    let variant = cleanVariant(row.variant);
    if (variant && isFabricatedVariant(model, variant)) {
      variant = '';
    }
    rows.push({
      productId: String(productId || '').trim(),
      brand,
      model,
      variant,
    });
  }

  rows.sort((a, b) => (
    a.brand.localeCompare(b.brand)
    || a.model.localeCompare(b.model)
    || String(a.variant || '').localeCompare(String(b.variant || ''))
    || a.productId.localeCompare(b.productId)
  ));
  return rows;
}

function normalizeOverrideValues(overrideDoc = {}) {
  const overrides = (overrideDoc && typeof overrideDoc === 'object' && !Array.isArray(overrideDoc))
    ? overrideDoc.overrides
    : null;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return {};
  }

  const canonicalFields = {};
  for (const [fieldKeyRaw, row] of Object.entries(overrides)) {
    const fieldKey = String(fieldKeyRaw ?? '').trim();
    if (!fieldKey) continue;
    const value = String(
      row?.override_value
      ?? row?.value
      ?? ''
    ).trim();
    if (!value) continue;
    canonicalFields[fieldKey] = value;
  }
  return canonicalFields;
}

async function loadCanonicalFieldsByProduct({ category, config = {} }) {
  const overrideDir = overrideDirPath({ category, config });
  let entries = [];
  try {
    entries = await fs.readdir(overrideDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    return {};
  }

  const out = {};
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.overrides.json'))
    .map((entry) => entry.name);

  for (const name of jsonFiles) {
    const doc = await readJsonIfExists(path.join(overrideDir, name));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      continue;
    }
    const fromPayload = String(doc.product_id ?? '').trim();
    const fromFileName = String(name).replace(/\.overrides\.json$/i, '').trim();
    const productId = fromPayload || fromFileName;
    if (!productId) continue;
    out[productId] = normalizeOverrideValues(doc);
  }
  return out;
}

/**
 * Load product identities (brand, model, variant) from app-owned catalog docs.
 * Returns [{ brand, model, variant }] or [] if no category catalog is present.
 */
export async function loadCatalogProducts({ category, config = {} }) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return [];

  try {
    const catalog = await readJsonIfExists(productCatalogPath({ category: cat, config }));
    const products = normalizeCatalogProducts(catalog);
    return products.map((row) => ({
      productId: row.productId,
      brand: row.brand,
      model: row.model,
      variant: row.variant,
    }));
  } catch {
    return [];
  }
}

/**
 * Load products with field values from app-owned catalog + overrides docs.
 * Returns [{ brand, model, variant, canonical_fields: {...} }] or [].
 */
export async function loadCatalogProductsWithFields({ category, config = {} }) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return [];

  try {
    const catalog = await readJsonIfExists(productCatalogPath({ category: cat, config }));
    const products = normalizeCatalogProducts(catalog);
    if (products.length === 0) {
      return [];
    }
    const canonicalByProduct = await loadCanonicalFieldsByProduct({ category: cat, config });
    return products.map((row) => ({
      productId: row.productId,
      brand: row.brand,
      model: row.model,
      variant: row.variant,
      canonical_fields: canonicalByProduct[row.productId] || {},
    }));
  } catch {
    return [];
  }
}

/**
 * List local category directories (replaces S3-based discoverCategories).
 * Scans category_authority/ for subdirectories, filters out _ prefixed ones.
 */
export async function discoverCategoriesLocal(options = {}) {
  const root = options.categoryAuthorityRoot || 'category_authority';
  const rootPath = path.resolve(root);
  const cats = [];

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('_')) {
        cats.push(e.name);
      }
    }
  } catch {}

  return cats.sort();
}

