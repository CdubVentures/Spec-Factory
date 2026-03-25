export function evaluateSearchLoopStop({
  noNewUrlsRounds = 0,
  noNewFieldsRounds = 0,
  budgetReached = false,
  repeatedLowQualityRounds = 0,
  maxNoProgressRounds,
  maxLowQualityRounds,
  // WHY: Registry settings flow in via the caller's settings bag.
  searchLoopMaxNoProgressRounds,
  searchLoopMaxLowQualityRounds,
} = {}) {
  // WHY: Resolve registry settings → explicit param → fallback constant.
  const effectiveMaxNoProgress = maxNoProgressRounds ?? searchLoopMaxNoProgressRounds ?? 2;
  const effectiveMaxLowQuality = maxLowQualityRounds ?? searchLoopMaxLowQualityRounds ?? 3;
  if (budgetReached) {
    return {
      stop: true,
      reason: 'budget_reached'
    };
  }
  if (noNewUrlsRounds >= effectiveMaxNoProgress && noNewFieldsRounds >= effectiveMaxNoProgress) {
    return {
      stop: true,
      reason: 'no_new_urls_and_fields'
    };
  }
  if (noNewFieldsRounds >= effectiveMaxNoProgress) {
    return {
      stop: true,
      reason: 'no_new_fields'
    };
  }
  if (repeatedLowQualityRounds >= effectiveMaxLowQuality) {
    return {
      stop: true,
      reason: 'low_quality_results'
    };
  }
  return {
    stop: false,
    reason: 'continue'
  };
}
