import {
  FINDER_DATA_CHANGE_EVENTS,
  FINDER_DATA_CHANGE_DOMAINS,
  FINDER_MODULES,
} from '../finder/finderModuleRegistry.js';

export const CATEGORY_TOKEN = ':category';

const authoritySnapshotTemplate = Object.freeze([
  ['data-authority', 'snapshot', CATEGORY_TOKEN],
]);

function withAuthoritySnapshot(templates) {
  return Object.freeze([
    ...templates,
    ...authoritySnapshotTemplate,
  ]);
}

const finderModuleQueryTemplates = Object.freeze(
  FINDER_MODULES.map((mod) => Object.freeze([mod.routePrefix, CATEGORY_TOKEN])),
);

export const DOMAIN_QUERY_TEMPLATES = Object.freeze({
  studio: withAuthoritySnapshot([
    ['studio', CATEGORY_TOKEN],
    ['studio-config', CATEGORY_TOKEN],
    ['studio-tooltip-bank', CATEGORY_TOKEN],
    ['studio-known-values', CATEGORY_TOKEN],
    ['studio-component-db', CATEGORY_TOKEN],
    ['studio-artifacts', CATEGORY_TOKEN],
  ]),
  mapping: withAuthoritySnapshot([
    ['studio-config', CATEGORY_TOKEN],
    ['studio-artifacts', CATEGORY_TOKEN],
    ['key-finder', CATEGORY_TOKEN],
    ['reviewLayout', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
    ['fieldLabels', CATEGORY_TOKEN],
  ]),
  'review-layout': withAuthoritySnapshot([
    ['reviewLayout', CATEGORY_TOKEN],
    ['componentReviewLayout', CATEGORY_TOKEN],
    ['prompt-preview', 'key', CATEGORY_TOKEN],
  ]),
  labels: withAuthoritySnapshot([
    ['fieldLabels', CATEGORY_TOKEN],
  ]),
  catalog: withAuthoritySnapshot([
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
  identity: withAuthoritySnapshot([
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
  review: withAuthoritySnapshot([
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
  component: withAuthoritySnapshot([
    ['componentReview', CATEGORY_TOKEN],
    ['componentReviewData', CATEGORY_TOKEN],
    ['componentReviewLayout', CATEGORY_TOKEN],
    ['studio-component-db', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['product', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
    ['componentImpact'],
  ]),
  enum: withAuthoritySnapshot([
    ['enumReviewData', CATEGORY_TOKEN],
    ['studio-known-values', CATEGORY_TOKEN],
    ['reviewProductsIndex', CATEGORY_TOKEN],
    ['candidates', CATEGORY_TOKEN],
  ]),
  product: withAuthoritySnapshot([
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
  ...Object.fromEntries(
    FINDER_MODULES.map((mod) => [
      mod.routePrefix,
      Object.freeze([[mod.routePrefix, CATEGORY_TOKEN]]),
    ]),
  ),
  categories: Object.freeze([
    ['categories'],
    ['categories-real'],
  ]),
  settings: Object.freeze([
    ['ui-settings'],
    ['runtime-settings'],
    ['indexing', 'llm-config'],
    ...finderModuleQueryTemplates,
    ['prompt-preview'],
  ]),
  storage: Object.freeze([
    ['storage'],
    ['storage', 'overview'],
    ['storage', 'runs', CATEGORY_TOKEN],
    ['indexlab', 'runs'],
    ['indexlab', 'product-history', CATEGORY_TOKEN],
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
  publisher: Object.freeze([
    ['publisher', CATEGORY_TOKEN],
    ['publisher', 'published', CATEGORY_TOKEN],
    ['publisher', 'reconcile', CATEGORY_TOKEN],
  ]),
  'module-settings': Object.freeze([
    ['module-settings'],
    ...finderModuleQueryTemplates,
    ['prompt-preview'],
  ]),
});

export const KNOWN_DATA_CHANGE_DOMAINS = Object.freeze(Object.keys(DOMAIN_QUERY_TEMPLATES));

export const EVENT_REGISTRY = Object.freeze({
  ...FINDER_DATA_CHANGE_EVENTS,
  'field-studio-map-saved': ['studio', 'mapping', 'review-layout', 'labels'],
  'field-key-order-saved': ['studio', 'mapping', 'review-layout'],
  'process-completed': ['studio', 'review-layout', 'component', 'enum', 'storage'],
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
  'spec-seeds-updated': ['spec-seeds'],
  'runtime-settings-updated': ['settings', 'indexing'],
  'user-settings-updated': ['settings', 'indexing'],
  'module-settings-updated': ['module-settings'],
  'category-created': ['categories'],
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
  'review-manual-override': ['review', 'product', 'publisher'],
  'review-clear-published': ['review', 'product', 'publisher'],
  'review-variant-field-deleted': ['review', 'product'],
  'key-finder-unpublished': ['key-finder', 'review', 'product', 'publisher', 'catalog'],
  'candidate-deleted': ['review', 'product'],
  'key-review-confirm': ['review', 'product'],
  'key-review-accept': ['review', 'product'],
  'component-override': ['component', 'review'],
  'component-key-review-confirm': ['component', 'review'],
  'enum-override': ['enum', 'review'],
  'enum-rename': ['enum', 'review'],
  'publisher-reconcile': ['publisher', 'review'],
  'storage-runs-deleted': ['storage'],
  'storage-runs-bulk-deleted': ['storage'],
  'storage-pruned': ['storage'],
  'storage-purged': ['storage', 'catalog'],
  'storage-urls-deleted': ['storage'],
  'storage-history-purged': ['storage', 'catalog'],
});

export const KNOWN_DATA_CHANGE_EVENTS = Object.freeze(Object.keys(EVENT_REGISTRY));

export { FINDER_DATA_CHANGE_DOMAINS };
