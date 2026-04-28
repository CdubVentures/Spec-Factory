import { CANONICAL_VIEW_KEYS, resolveViewBudget } from './productImageLlmAdapter.js';

const DEFAULT_CAROUSEL_EXTRA_TARGET = 3;

function parseJsonArraySetting(value) {
  if (!value || typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueCanonicalViews(views = []) {
  const seen = new Set();
  const result = [];
  for (const view of views) {
    const key = String(view || '').trim();
    if (!CANONICAL_VIEW_KEYS.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function parsePositiveIntSetting(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function resolveCarouselViewSettings({ finderStore, category }) {
  const viewBudget = resolveViewBudget(finderStore?.getSetting?.('viewBudget') || '', category);
  const scoredSetting = finderStore?.getSetting?.('carouselScoredViews') || '';
  const optionalSetting = finderStore?.getSetting?.('carouselOptionalViews') || '';

  const scoredViews = uniqueCanonicalViews(parseJsonArraySetting(scoredSetting));
  const carouselScoredViews = scoredViews.length > 0 ? scoredViews : viewBudget;
  const scoredSet = new Set(carouselScoredViews);
  const carouselOptionalViews = uniqueCanonicalViews(parseJsonArraySetting(optionalSetting))
    .filter((view) => !scoredSet.has(view));
  const carouselSlotViews = uniqueCanonicalViews([...carouselScoredViews, ...carouselOptionalViews]);
  const carouselExtraTarget = parsePositiveIntSetting(
    finderStore?.getSetting?.('carouselExtraTarget') || '',
    DEFAULT_CAROUSEL_EXTRA_TARGET,
  );

  return {
    viewBudget,
    carouselScoredViews,
    carouselOptionalViews,
    carouselSlotViews,
    carouselExtraTarget,
  };
}
