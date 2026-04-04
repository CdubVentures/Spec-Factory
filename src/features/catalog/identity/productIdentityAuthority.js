import { isObject, normalizeToken } from '../../../shared/primitives.js';

function humanizeSlugToken(value) {
  return String(value || '')
    .split(/[^a-z0-9]+/i)
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return parsed;
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function pickVariant(...sources) {
  for (const source of sources) {
    if (!isObject(source)) continue;
    if (!Object.prototype.hasOwnProperty.call(source, 'variant')) continue;
    return String(source.variant ?? '').trim();
  }
  return '';
}

// WHY: loadCatalogProduct removed — SQL (specDb) is the sole SSOT for product identity.
// The catalog → db → normalized → inferred hierarchy is now: db → normalized → inferred.

function loadSpecDbProduct({
  productId = '',
  specDb = null,
} = {}) {
  if (!specDb || typeof specDb.getProduct !== 'function') return {};
  const pid = String(productId || '').trim();
  if (!pid) return {};
  try {
    const product = specDb.getProduct(pid);
    return isObject(product) ? product : {};
  } catch {
    return {};
  }
}

// WHY: Product IDs are opaque hex tokens ({category}-{8-hex}). No identity can be inferred.
export function inferIdentityFromProductId() {
  return { brand: '', base_model: '', model: '', variant: '' };
}

export function resolveAuthoritativeProductIdentity({
  productId = '',
  category = '',
  catalogProduct = null,
  dbProduct = null,
  normalizedIdentity = null,
} = {}) {
  const catalog = isObject(catalogProduct) ? catalogProduct : {};
  const db = isObject(dbProduct) ? dbProduct : {};
  const normalized = isObject(normalizedIdentity) ? normalizedIdentity : {};

  const id = parsePositiveInt(catalog.id)
    ?? parsePositiveInt(db.id)
    ?? parsePositiveInt(normalized.id)
    ?? 0;

  const identifier = pickFirstNonEmpty(
    catalog.identifier,
    db.identifier,
    normalized.identifier,
  );

  const brand = pickFirstNonEmpty(
    catalog.brand,
    db.brand,
    normalized.brand,
  );

  const base_model = pickFirstNonEmpty(
    catalog.base_model,
    db.base_model,
    normalized.base_model,
  );

  const model = pickFirstNonEmpty(
    catalog.model,
    db.model,
    normalized.model,
  );

  const variant = pickVariant(catalog, db, normalized);

  return {
    id,
    identifier,
    brand,
    base_model,
    model,
    variant,
  };
}

export async function resolveProductIdentity({
  category = '',
  productId = '',
  config = {},
  specDb = null,
  catalogProduct = null,
  dbProduct = null,
  normalizedIdentity = null,
} = {}) {
  // WHY: SQL is SSOT. catalogProduct param kept for backward compat but db takes priority.
  const db = isObject(dbProduct)
    ? dbProduct
    : loadSpecDbProduct({ productId, specDb });
  const catalog = isObject(catalogProduct) ? catalogProduct : {};

  return resolveAuthoritativeProductIdentity({
    productId,
    category,
    catalogProduct: catalog,
    dbProduct: db,
    normalizedIdentity,
  });
}
