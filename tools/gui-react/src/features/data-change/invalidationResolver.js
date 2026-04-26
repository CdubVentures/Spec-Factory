import {
  normalizeDataChangeToken,
  collectDataChangeDomains,
} from './domainScope.js';
import { collectDataChangeCategories } from './categoryScope.js';
import {
  CATEGORY_TOKEN,
  DOMAIN_QUERY_TEMPLATES,
  KNOWN_DATA_CHANGE_DOMAINS,
  EVENT_REGISTRY,
} from '../../../../../src/core/events/eventRegistry.js';

export { KNOWN_DATA_CHANGE_DOMAINS };

export const DATA_CHANGE_EVENT_DOMAIN_FALLBACK = EVENT_REGISTRY;

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
  ['storage'],
  ['storage', 'overview'],
  ['indexlab', 'runs'],
  ['module-settings'],
  ['data-authority', 'snapshot', CATEGORY_TOKEN],
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

function normalizeEntityToken(value) {
  return String(value || '').trim();
}

function collectEntityTokens(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeEntityToken).filter(Boolean))];
}

function resolveMessageEntities(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const entities = msg.entities && typeof msg.entities === 'object' ? msg.entities : {};
  return {
    productIds: collectEntityTokens(entities.productIds),
    fieldKeys: collectEntityTokens(entities.fieldKeys),
  };
}

function resolveEntityScopedQueryKeys(message, categories) {
  const { productIds, fieldKeys } = resolveMessageEntities(message);
  if (productIds.length === 0 || categories.length === 0) return [];

  const queryKeys = [];
  for (const category of categories) {
    for (const productId of productIds) {
      queryKeys.push(['product', category, productId]);
      queryKeys.push(['publisher', 'published', category, productId]);
      queryKeys.push(['indexlab', 'product-history', category, productId]);

      if (fieldKeys.length === 0) {
        queryKeys.push(['candidates', category, productId]);
        continue;
      }

      for (const fieldKey of fieldKeys) {
        queryKeys.push(['candidates', category, productId, fieldKey]);
      }
    }
  }
  return queryKeys;
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
  const queryKeys = [
    ...templates.flatMap((template) => materializeTemplate(template, scopedCategories)),
    ...resolveEntityScopedQueryKeys(message, scopedCategories),
  ];
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
