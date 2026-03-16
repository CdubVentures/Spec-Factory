import { collectContributionFields } from '../shared/candidateHelpers.js';

export function buildFinalizationMetricsContext({
  sourceResults = [],
  fieldOrder = [],
  normalized = {},
  provenance = {},
  collectContributionFieldsFn = collectContributionFields,
} = {}) {
  const parserHealthRows = sourceResults
    .map((source) => source.parserHealth)
    .filter(Boolean);
  const parserHealthAverage = parserHealthRows.length
    ? parserHealthRows.reduce((sum, row) => sum + (row.health_score || 0), 0) / parserHealthRows.length
    : 0;
  const fingerprintCount = new Set(
    sourceResults
      .map((source) => source.fingerprint?.id)
      .filter(Boolean),
  ).size;
  const contribution = collectContributionFieldsFn({
    fieldOrder,
    normalized,
    provenance,
  });

  return {
    parserHealthRows,
    parserHealthAverage,
    fingerprintCount,
    contribution,
  };
}
