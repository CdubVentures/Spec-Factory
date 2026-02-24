const CATEGORY_TOKEN = ':category';

function normalizedToken(value) {
  return String(value || '').trim();
}

function normalizedCategory(value) {
  const category = normalizedToken(value);
  if (!category) return '';
  return category.toLowerCase() === 'all' ? '' : category;
}

function normalizedArray(values, normalizeValue) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const output = [];
  for (const value of source) {
    const normalized = normalizeValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

const DOMAIN_QUERY_TEMPLATES = Object.freeze({
  studio: Object.freeze([
    ['studio', CATEGORY_TOKEN],
    ['studio-drafts', CATEGORY_TOKEN],
    ['studio-config', CATEGORY_TOKEN],
    ['studio-tooltip-bank', CATEGORY_TOKEN],
    ['studio-known-values', CATEGORY_TOKEN],
    ['studio-component-db', CATEGORY_TOKEN],
    ['studio-artifacts', CATEGORY_TOKEN],
  ]),
  mapping: Object.freeze([
    ['studio-config', CATEGORY_TOKEN],
    ['studio-artifacts', CATEGORY_TOKEN],
    ['reviewLayout', CATEGORY_TOKEN],
    ['fieldLabels', CATEGORY_TOKEN],
  ]),
  'review-layout': Object.freeze([
    ['reviewLayout', CATEGORY_TOKEN],
    ['componentReviewLayout', CATEGORY_TOKEN],
  ]),
  labels: Object.freeze([
    ['fieldLabels', CATEGORY_TOKEN],
  ]),
  catalog: Object.freeze([
    ['catalog', CATEGORY_TOKEN],
    ['catalog-products', CATEGORY_TOKEN],
    ['catalog-review', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
  ]),
  brand: Object.freeze([
    ['brands'],
    ['brand-impact'],
    ['brands', CATEGORY_TOKEN],
    ['catalog', CATEGORY_TOKEN],
    ['catalog-products', CATEGORY_TOKEN],
    ['catalog-review', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
  ]),
  identity: Object.freeze([
    ['catalog', CATEGORY_TOKEN],
    ['catalog-products', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
    ['componentReview', CATEGORY_TOKEN],
    ['componentReviewData', CATEGORY_TOKEN],
    ['enumReview', CATEGORY_TOKEN],
    ['enumReviewData', CATEGORY_TOKEN],
    ['componentImpact'],
  ]),
  queue: Object.freeze([
    ['queue', CATEGORY_TOKEN],
  ]),
  review: Object.freeze([
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['catalog-review', CATEGORY_TOKEN],
    ['catalog', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
    ['componentReview', CATEGORY_TOKEN],
    ['componentReviewData', CATEGORY_TOKEN],
    ['enumReview', CATEGORY_TOKEN],
    ['enumReviewData', CATEGORY_TOKEN],
    ['componentImpact'],
  ]),
  suggestions: Object.freeze([
    ['candidates', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
  ]),
  component: Object.freeze([
    ['componentReview', CATEGORY_TOKEN],
    ['componentReviewData', CATEGORY_TOKEN],
    ['componentReviewLayout', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
    ['componentImpact'],
  ]),
  enum: Object.freeze([
    ['enumReview', CATEGORY_TOKEN],
    ['enumReviewData', CATEGORY_TOKEN],
    ['studio-known-values', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
  ]),
  product: Object.freeze([
    ['product', CATEGORY_TOKEN],
    ['catalog', CATEGORY_TOKEN],
    ['catalog-review', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
    ['componentImpact'],
  ]),
  settings: Object.freeze([
    ['llm-settings-routes', CATEGORY_TOKEN],
    ['convergence-settings'],
    ['indexing', 'llm-config'],
  ]),
  'source-strategy': Object.freeze([
    ['source-strategy'],
  ]),
  indexing: Object.freeze([
    ['indexing', 'llm-config'],
    ['indexing', 'llm-metrics', CATEGORY_TOKEN],
    ['convergence-settings'],
  ]),
});

export const KNOWN_DATA_CHANGE_DOMAINS = Object.freeze([
  'brand',
  'catalog',
  'component',
  'enum',
  'identity',
  'indexing',
  'labels',
  'mapping',
  'product',
  'queue',
  'review',
  'review-layout',
  'source-strategy',
  'settings',
  'studio',
  'suggestions',
]);

export const DATA_CHANGE_EVENT_DOMAIN_FALLBACK = Object.freeze({
  'studio-drafts-saved': ['studio', 'review-layout', 'labels', 'product'],
  'workbook-map-saved': ['studio', 'mapping', 'review-layout'],
  'process-completed': ['studio', 'review-layout', 'component', 'enum'],
  'catalog-seed': ['catalog', 'queue', 'identity'],
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
  'llm-settings-updated': ['settings', 'indexing'],
  'llm-settings-reset': ['settings', 'indexing'],
  'convergence-settings-updated': ['settings', 'indexing'],
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

const EVENT_DOMAIN_FALLBACK = DATA_CHANGE_EVENT_DOMAIN_FALLBACK;

const FALLBACK_QUERY_TEMPLATES = Object.freeze([
  ['brands'],
  ['brand-impact'],
  ['studio', CATEGORY_TOKEN],
  ['studio-drafts', CATEGORY_TOKEN],
  ['studio-config', CATEGORY_TOKEN],
  ['studio-tooltip-bank', CATEGORY_TOKEN],
  ['studio-known-values', CATEGORY_TOKEN],
  ['studio-component-db', CATEGORY_TOKEN],
  ['studio-artifacts', CATEGORY_TOKEN],
  ['fieldLabels', CATEGORY_TOKEN],
  ['reviewLayout', CATEGORY_TOKEN],
  ['reviewProductsIndex', CATEGORY_TOKEN],
  ['candidates', CATEGORY_TOKEN],
  ['product', CATEGORY_TOKEN],
  ['catalog', CATEGORY_TOKEN],
  ['catalog-products', CATEGORY_TOKEN],
  ['catalog-review', CATEGORY_TOKEN],
  ['brands', CATEGORY_TOKEN],
  ['componentReview', CATEGORY_TOKEN],
  ['componentReviewData', CATEGORY_TOKEN],
  ['componentReviewLayout', CATEGORY_TOKEN],
  ['enumReview', CATEGORY_TOKEN],
  ['enumReviewData', CATEGORY_TOKEN],
  ['queue', CATEGORY_TOKEN],
  ['source-strategy'],
  ['componentImpact'],
]);

function resolveDomainsFromMessage(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const explicitDomains = normalizedArray(msg.domains, (value) => normalizedToken(value).toLowerCase());
  if (explicitDomains.length > 0) return explicitDomains;

  const eventName = normalizedToken(msg.event || '').toLowerCase();
  if (!eventName) return [];
  return normalizedArray(EVENT_DOMAIN_FALLBACK[eventName], (value) => normalizedToken(value).toLowerCase());
}

function resolveTemplatesForDomains(domains) {
  const templates = [];
  for (const domain of domains) {
    const domainTemplates = DOMAIN_QUERY_TEMPLATES[domain];
    if (!Array.isArray(domainTemplates)) continue;
    templates.push(...domainTemplates);
  }
  return templates.length > 0 ? templates : FALLBACK_QUERY_TEMPLATES;
}

function resolveScopedCategories(categories, fallbackCategory) {
  const normalizedCategories = normalizedArray(categories, normalizedCategory);
  if (normalizedCategories.length > 0) return normalizedCategories;
  const fallback = normalizedCategory(fallbackCategory);
  return fallback ? [fallback] : [];
}

function materializeTemplate(template, categories) {
  if (!Array.isArray(template) || template.length === 0) return [];
  if (!template.includes(CATEGORY_TOKEN)) {
    return [template];
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return [];
  }
  return categories.map((category) =>
    template.map((token) => (token === CATEGORY_TOKEN ? category : token)));
}

function dedupeQueryKeys(queryKeys) {
  const seen = new Set();
  const unique = [];
  for (const queryKey of queryKeys) {
    if (!Array.isArray(queryKey) || queryKey.length === 0) continue;
    const signature = JSON.stringify(queryKey);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(queryKey);
  }
  return unique;
}

export function resolveDataChangeInvalidationQueryKeys({
  message,
  categories = [],
  fallbackCategory = '',
} = {}) {
  const domains = resolveDomainsFromMessage(message);
  const scopedCategories = resolveScopedCategories(categories, fallbackCategory);
  const templates = resolveTemplatesForDomains(domains);
  const queryKeys = templates.flatMap((template) => materializeTemplate(template, scopedCategories));
  return dedupeQueryKeys(queryKeys);
}

export function invalidateDataChangeQueries({
  queryClient,
  message,
  categories = [],
  fallbackCategory = '',
} = {}) {
  if (!queryClient || typeof queryClient.invalidateQueries !== 'function') return [];
  const queryKeys = resolveDataChangeInvalidationQueryKeys({
    message,
    categories,
    fallbackCategory,
  });
  for (const queryKey of queryKeys) {
    queryClient.invalidateQueries({ queryKey });
  }
  return queryKeys;
}

export function findUnmappedDataChangeDomains(domains) {
  return normalizedArray(domains, (value) => normalizedToken(value).toLowerCase())
    .filter((domain) => !Object.hasOwn(DOMAIN_QUERY_TEMPLATES, domain));
}
