export async function runSourceIntelFinalizationPhase({
  storage,
  config = {},
  category = '',
  productId = '',
  brand = '',
  sourceResults = [],
  provenance = {},
  categoryConfig = {},
  constraintAnalysis = {},
  summary = {},
  persistSourceIntelFn,
} = {}) {
  const intelResult = await persistSourceIntelFn({
    storage,
    config,
    category,
    productId,
    brand,
    sourceResults,
    provenance,
    categoryConfig,
    constraintAnalysis,
  });

  summary.source_intel = {
    domain_stats_key: intelResult.domainStatsKey,
    promotion_suggestions_key: intelResult.promotionSuggestionsKey,
    expansion_plan_key: intelResult.expansionPlanKey,
    brand_expansion_plan_count: intelResult.brandExpansionPlanCount,
  };

  return intelResult;
}
