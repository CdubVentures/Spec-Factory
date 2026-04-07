import { recordDataChangeBroadcast } from './dataPropagationCounters.js';

export const DATA_CHANGE_EVENT_DOMAIN_MAP = Object.freeze({
  'field-studio-map-saved': ['studio', 'mapping', 'review-layout'],
  'process-completed': ['studio', 'review-layout', 'component', 'enum'],
  'catalog-bulk-add': ['catalog', 'queue', 'identity'],
  'catalog-product-add': ['catalog', 'queue', 'identity'],
  'catalog-product-update': ['catalog', 'queue', 'identity'],
  'catalog-product-delete': ['catalog', 'queue', 'identity'],
  'brand-seed': ['brand', 'catalog', 'identity'],
  'brand-bulk-add': ['brand', 'catalog', 'identity'],
  'brand-add': ['brand', 'catalog', 'identity'],
  'brand-rename': ['brand', 'catalog', 'identity', 'queue'],
  'brand-update': ['brand', 'catalog', 'identity'],
  'brand-delete': ['brand', 'catalog', 'identity'],
  'color-add': ['color-registry'],
  'color-update': ['color-registry'],
  'color-delete': ['color-registry'],
  'color-edition-finder-run': ['color-edition-finder'],
  'spec-seeds-updated': ['spec-seeds'],
  'llm-settings-updated': ['settings', 'indexing'],
  'llm-settings-reset': ['settings', 'indexing'],
  'runtime-settings-updated': ['settings', 'indexing'],
  'user-settings-updated': ['settings', 'indexing'],
  'category-created': ['categories'],
  'test-mode-created': ['test-mode', 'categories'],
  'test-mode-products-generated': ['test-mode'],
  'test-mode-deleted': ['test-mode', 'categories'],
  'source-strategy-created': ['source-strategy'],
  'source-strategy-updated': ['source-strategy'],
  'source-strategy-deleted': ['source-strategy'],
  'queue-retry': ['queue'],
  'queue-pause': ['queue'],
  'queue-priority': ['queue'],
  'queue-requeue': ['queue'],
  'review-suggest': ['review', 'suggestions'],
  review: ['review'],
  'component-review': ['component', 'review'],
  'review-override': ['review', 'product'],
  'review-manual-override': ['review', 'product'],
  'key-review-confirm': ['review', 'product'],
  'key-review-accept': ['review', 'product'],
  'component-override': ['component', 'review'],
  'component-key-review-confirm': ['component', 'review'],
  'enum-override': ['enum', 'review'],
  'enum-rename': ['enum', 'review'],
  'enum-consistency': ['enum', 'review'],
});

const EVENT_DOMAIN_MAP = DATA_CHANGE_EVENT_DOMAIN_MAP;

export const DATA_CHANGE_EVENT_NAMES = Object.freeze(Object.keys(EVENT_DOMAIN_MAP));

function normalizedString(value, { lowercase = false } = {}) {
  const token = String(value ?? '').trim();
  if (!token) return '';
  return lowercase ? token.toLowerCase() : token;
}

function normalizedStringArray(value, { lowercase = false } = {}) {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const list = [];
  for (const rawValue of source) {
    const token = normalizedString(rawValue, { lowercase });
    if (!token || seen.has(token)) continue;
    seen.add(token);
    list.push(token);
  }
  return list;
}

function normalizedCategory(value) {
  return normalizedString(value, { lowercase: true });
}

function resolvedCategories(category, categories) {
  const normalized = normalizedStringArray(categories || [], { lowercase: true })
    .filter((token) => token !== 'all');
  const cat = normalizedCategory(category);
  if (cat && cat !== 'all' && !normalized.includes(cat)) {
    return [cat, ...normalized];
  }
  return normalized;
}

function resolvedCategoryToken(category, categories) {
  const cat = normalizedCategory(category);
  if (cat) return cat;
  if (Array.isArray(categories) && categories.length > 1) return 'all';
  if (Array.isArray(categories) && categories.length === 1) return categories[0];
  return '';
}

function resolvedDomains(event, domains) {
  const mapped = EVENT_DOMAIN_MAP[String(event || '')] || [];
  const candidateDomains = Array.isArray(domains) && domains.length > 0 ? domains : mapped;
  return normalizedStringArray(candidateDomains, { lowercase: true });
}

function normalizedVersion(version) {
  const source = version && typeof version === 'object' ? version : {};
  const syncVersionRaw = source.specdb_sync_version;
  const syncVersion = Number(syncVersionRaw);
  return {
    map_hash: normalizedString(source.map_hash) || null,
    compiled_hash: normalizedString(source.compiled_hash) || null,
    specdb_sync_version: Number.isFinite(syncVersion) ? Math.trunc(syncVersion) : null,
    updated_at: normalizedString(source.updated_at) || null,
  };
}

function normalizedMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function resolvedEntities(entities, meta) {
  const source = entities && typeof entities === 'object' ? entities : {};
  const metaSource = meta && typeof meta === 'object' ? meta : {};
  const productIds = normalizedStringArray([
    ...(Array.isArray(source.productIds) ? source.productIds : []),
    ...(Array.isArray(metaSource.productIds) ? metaSource.productIds : []),
    metaSource.productId,
  ]);
  const fieldKeys = normalizedStringArray([
    ...(Array.isArray(source.fieldKeys) ? source.fieldKeys : []),
    ...(Array.isArray(metaSource.fieldKeys) ? metaSource.fieldKeys : []),
    ...(Array.isArray(metaSource.fields) ? metaSource.fields : []),
    metaSource.field,
    metaSource.fieldKey,
  ]);
  return { productIds, fieldKeys };
}

function normalizedTimestamp(ts) {
  const token = normalizedString(ts);
  if (!token) return new Date().toISOString();
  const parsed = Date.parse(token);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

export function createDataChangePayload({
  event,
  category = '',
  categories = [],
  domains = null,
  version = null,
  entities = null,
  meta = null,
  ts = null,
} = {}) {
  const normalizedEvent = normalizedString(event, { lowercase: true });
  const normalizedCategoryInput = normalizedCategory(category);
  const normalizedCategories = resolvedCategories(normalizedCategoryInput, categories);
  const normalizedCategoryToken = resolvedCategoryToken(normalizedCategoryInput, normalizedCategories);
  const normalizedMetaPayload = normalizedMeta(meta);
  return {
    type: 'data-change',
    event: normalizedEvent,
    category: normalizedCategoryToken,
    categories: normalizedCategories,
    domains: resolvedDomains(normalizedEvent, domains),
    version: normalizedVersion(version),
    entities: resolvedEntities(entities, normalizedMetaPayload),
    meta: normalizedMetaPayload,
    ts: normalizedTimestamp(ts),
  };
}

export function emitDataChange({
  broadcastWs,
  event,
  category = '',
  categories = [],
  domains = null,
  version = null,
  entities = null,
  meta = null,
  ts = null,
} = {}) {
  const payload = createDataChangePayload({
    event,
    category,
    categories,
    domains,
    version,
    entities,
    meta,
    ts,
  });
  if (!isDataChangePayload(payload)) return null;
  recordDataChangeBroadcast({
    event: payload.event,
    category: payload.category,
    categories: payload.categories,
  });
  broadcastWs?.('data-change', payload);
  return payload;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isVersionObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Object.hasOwn(value, 'map_hash')) return false;
  if (!Object.hasOwn(value, 'compiled_hash')) return false;
  if (!Object.hasOwn(value, 'specdb_sync_version')) return false;
  if (!Object.hasOwn(value, 'updated_at')) return false;
  const mapHashValid = value.map_hash === null || typeof value.map_hash === 'string';
  const compiledHashValid = value.compiled_hash === null || typeof value.compiled_hash === 'string';
  const updatedAtValid = value.updated_at === null || typeof value.updated_at === 'string';
  const syncVersionValid = value.specdb_sync_version === null || Number.isFinite(Number(value.specdb_sync_version));
  return mapHashValid && compiledHashValid && updatedAtValid && syncVersionValid;
}

function isEntitiesObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (!isStringArray(value.productIds)) return false;
  if (!isStringArray(value.fieldKeys)) return false;
  return true;
}

export function isDataChangePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type !== 'data-change') return false;
  if (typeof payload.event !== 'string' || !payload.event.trim()) return false;
  if (typeof payload.category !== 'string') return false;
  if (!isStringArray(payload.categories)) return false;
  if (payload.categories.some((category) => normalizedCategory(category) === 'all')) return false;
  if (payload.category && payload.category !== 'all' && !payload.categories.includes(payload.category)) return false;
  if (!isStringArray(payload.domains)) return false;
  if (!isVersionObject(payload.version)) return false;
  if (!isEntitiesObject(payload.entities)) return false;
  if (typeof payload.ts !== 'string' || !payload.ts.trim()) return false;
  if (!Number.isFinite(Date.parse(payload.ts))) return false;
  if (payload.meta === null || payload.meta === undefined) return true;
  return typeof payload.meta === 'object' && !Array.isArray(payload.meta);
}

export function dataChangeMatchesCategory(payload, category = '') {
  const clientCategory = normalizedCategory(category);
  if (!clientCategory || clientCategory === 'all') return true;
  if (!isDataChangePayload(payload)) return false;

  if (payload.category === 'all') {
    if (payload.categories.length === 0) return true;
    return payload.categories.includes(clientCategory);
  }
  if (payload.categories.length > 0) {
    return payload.categories.includes(clientCategory);
  }
  if (!payload.category) return true;
  return payload.category === clientCategory;
}
