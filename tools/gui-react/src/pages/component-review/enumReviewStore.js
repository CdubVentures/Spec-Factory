const ENUM_REVIEW_QUERY_KEY = 'enumReviewData';
const REVIEW_PRODUCTS_QUERY_KEY = 'reviewProductsIndex';
const STUDIO_KNOWN_VALUES_QUERY_KEY = 'studio-known-values';

export function normalizeEnumReviewCategory(category) {
  const token = String(category || '').trim();
  return token || 'all';
}

export function getEnumReviewQueryKey(category) {
  return [ENUM_REVIEW_QUERY_KEY, normalizeEnumReviewCategory(category)];
}

function getReviewProductsQueryKey(category) {
  return [REVIEW_PRODUCTS_QUERY_KEY, normalizeEnumReviewCategory(category)];
}

function getStudioKnownValuesQueryKey(category) {
  return [STUDIO_KNOWN_VALUES_QUERY_KEY, normalizeEnumReviewCategory(category)];
}

function canUseQueryClientMethod(queryClient, methodName) {
  return Boolean(queryClient) && typeof queryClient[methodName] === 'function';
}

export function shouldEnableEnumReviewQuery(category, enabled = true) {
  if (!enabled) return false;
  const normalizedCategory = normalizeEnumReviewCategory(category);
  return Boolean(normalizedCategory) && normalizedCategory !== 'all';
}

export function invalidateEnumReviewDataQuery(queryClient, category) {
  if (!canUseQueryClientMethod(queryClient, 'invalidateQueries')) return;
  queryClient.invalidateQueries({ queryKey: getEnumReviewQueryKey(category) });
}

export function invalidateEnumAuthorityQueries(
  queryClient,
  category,
  {
    includeReviewProductsIndex = true,
    includeStudioKnownValues = true,
  } = {},
) {
  if (!canUseQueryClientMethod(queryClient, 'invalidateQueries')) return;
  invalidateEnumReviewDataQuery(queryClient, category);
  if (includeReviewProductsIndex) {
    queryClient.invalidateQueries({ queryKey: getReviewProductsQueryKey(category) });
  }
  if (includeStudioKnownValues) {
    queryClient.invalidateQueries({ queryKey: getStudioKnownValuesQueryKey(category) });
  }
}

export function setEnumReviewQueryData(queryClient, category, updater) {
  if (!canUseQueryClientMethod(queryClient, 'setQueryData')) return undefined;
  return queryClient.setQueryData(getEnumReviewQueryKey(category), updater);
}
