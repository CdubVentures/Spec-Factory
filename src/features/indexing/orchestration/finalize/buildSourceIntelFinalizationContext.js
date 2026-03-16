export function buildSourceIntelFinalizationContext({
  storage,
  config,
  category,
  productId,
  brand,
  sourceResults,
  provenance,
  categoryConfig,
  constraintAnalysis,
  summary,
  persistSourceIntel,
} = {}) {
  return {
    storage,
    config,
    category,
    productId,
    brand,
    sourceResults,
    provenance,
    categoryConfig,
    constraintAnalysis,
    summary,
    persistSourceIntelFn: persistSourceIntel,
  };
}
