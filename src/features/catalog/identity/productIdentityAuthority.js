function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

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

async function loadCatalogProduct({
  category = '',
  productId = '',
  config = {},
  loadProductCatalog = null,
} = {}) {
  if (typeof loadProductCatalog !== 'function') return {};
  const cat = String(category || '').trim().toLowerCase();
  const pid = String(productId || '').trim();
  if (!cat || !pid) return {};
  try {
    const catalog = await loadProductCatalog(config, cat);
    const product = catalog?.products?.[pid];
    return isObject(product) ? product : {};
  } catch {
    return {};
  }
}

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

export function inferIdentityFromProductId(productId, category = '') {
  const tokens = normalizeToken(productId)
    .split('-')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return { brand: '', model: '', variant: '' };
  }

  const normalizedCategory = normalizeToken(category);
  if (normalizedCategory && tokens[0] === normalizedCategory) {
    tokens.shift();
  }
  if (tokens.length === 0) {
    return { brand: '', model: '', variant: '' };
  }

  const brandToken = tokens.shift() || '';
  let modelTokens = [...tokens];
  let variantToken = '';
  if (modelTokens.length >= 2) {
    const tail = modelTokens[modelTokens.length - 1];
    const prev = modelTokens[modelTokens.length - 2];
    if (tail && tail === prev) {
      variantToken = tail;
      modelTokens = modelTokens.slice(0, -1);
    }
  }

  return {
    brand: humanizeSlugToken(brandToken),
    model: humanizeSlugToken(modelTokens.join(' ')),
    variant: humanizeSlugToken(variantToken),
  };
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
  const inferred = inferIdentityFromProductId(productId, category);

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
    inferred.brand,
  );

  const model = pickFirstNonEmpty(
    catalog.model,
    db.model,
    normalized.model,
    inferred.model,
  );

  const variant = pickVariant(catalog, db, normalized, inferred);

  return {
    id,
    identifier,
    brand,
    model,
    variant,
  };
}

export async function resolveProductIdentity({
  category = '',
  productId = '',
  config = {},
  loadProductCatalog = null,
  specDb = null,
  catalogProduct = null,
  dbProduct = null,
  normalizedIdentity = null,
} = {}) {
  const catalog = isObject(catalogProduct)
    ? catalogProduct
    : await loadCatalogProduct({
      category,
      productId,
      config,
      loadProductCatalog,
    });
  const db = isObject(dbProduct)
    ? dbProduct
    : loadSpecDbProduct({ productId, specDb });

  return resolveAuthoritativeProductIdentity({
    productId,
    category,
    catalogProduct: catalog,
    dbProduct: db,
    normalizedIdentity,
  });
}
