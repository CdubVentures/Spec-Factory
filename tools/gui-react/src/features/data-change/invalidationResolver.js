import {
  normalizeDataChangeToken,
  collectDataChangeDomains,
} from './domainScope.js';
import { collectDataChangeCategories } from './categoryScope.js';

const CATEGORY_TOKEN = ':category';

const DOMAIN_QUERY_TEMPLATES = Object.freeze({
  studio: Object.freeze([
    ['studio', CATEGORY_TOKEN],
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
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
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
    ['studio-component-db', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
    ['componentImpact'],
  ]),
  enum: Object.freeze([
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
  'color-registry': Object.freeze([
    ['colors'],
  ]),
  'color-edition-finder': Object.freeze([
    ['color-edition-finder', CATEGORY_TOKEN],
  ]),
  categories: Object.freeze([
    ['categories'],
    ['categories-real'],
  ]),
  'test-mode': Object.freeze([
    ['contract-summary'],
    ['categories'],
    ['categories-real'],
  ]),
  settings: Object.freeze([
    ['ui-settings'],
    ['llm-settings-routes', CATEGORY_TOKEN],
    ['runtime-settings'],
    ['indexing', 'llm-config'],
  ]),
  storage: Object.freeze([
    ['indexlab', 'runs'],
  ]),
  'source-strategy': Object.freeze([
    ['source-strategy', CATEGORY_TOKEN],
  ]),
  'spec-seeds': Object.freeze([
    ['spec-seeds', CATEGORY_TOKEN],
  ]),
  indexing: Object.freeze([
    ['indexing', 'llm-config'],
    ['indexing', 'llm-metrics', CATEGORY_TOKEN],
  ]),
});

export const KNOWN_DATA_CHANGE_DOMAINS = Object.freeze([
  'brand',
  'catalog',
  'categories',
  'color-registry',
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
  'spec-seeds',
  'settings',
  'storage',
  'studio',
  'suggestions',
  'test-mode',
]);

export const DATA_CHANGE_EVENT_DOMAIN_FALLBACK = Object.freeze({
  'field-studio-map-saved': ['studio', 'mapping', 'review-layout'],
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
  'color-add': ['color-registry'],
  'color-update': ['color-registry'],
  'color-delete': ['color-registry'],
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
  'spec-seeds-updated': ['spec-seeds'],
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

const FALLBACK_QUERY_TEMPLATES = Object.freeze([
  ['brands'],
  ['brand-impact'],
  ['studio', CATEGORY_TOKEN],
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
  ['enumReviewData', CATEGORY_TOKEN],
  ['queue', CATEGORY_TOKEN],
  ['source-strategy', CATEGORY_TOKEN],
  ['componentImpact'],
]);

function resolveDomainsFromMessage(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const explicitDomains = collectDataChangeDomains(msg.domains);
  if (explicitDomains.length > 0) return explicitDomains;

  const eventName = normalizeDataChangeToken(msg.event || '').toLowerCase();
  if (!eventName) return [];
  return collectDataChangeDomains(DATA_CHANGE_EVENT_DOMAIN_FALLBACK[eventName]);
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
  const scopedCategories = collectDataChangeCategories({ categories, fallbackCategory });
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
  return collectDataChangeDomains(domains)
    .filter((domain) => !Object.hasOwn(DOMAIN_QUERY_TEMPLATES, domain));
}
