export function buildConstraintAnalysisContext({
  sourceResults = [],
  runtimeGateResult = {},
  normalized = { fields: {} },
  provenance = {},
  categoryConfig = { criticalFieldSet: new Set() },
  aggregateEndpointSignalsFn,
  evaluateConstraintGraphFn,
} = {}) {
  const manufacturerSources = sourceResults.filter((source) => source.role === 'manufacturer');
  const manufacturerMajorConflicts = manufacturerSources.reduce(
    (count, source) => count + ((source.anchorCheck?.majorConflicts || []).length > 0 ? 1 : 0),
    0,
  );
  const endpointMining = aggregateEndpointSignalsFn(sourceResults, 80);
  const compoundFailures = (runtimeGateResult.failures || []).flatMap((failure) =>
    (failure.violations || [])
      .filter((violation) => violation.reason_code === 'compound_range_conflict')
      .map((violation) => ({
        field_key: failure.field,
        reason_code: violation.reason_code,
        effective_min: violation.effective_min,
        effective_max: violation.effective_max,
        actual: violation.actual,
        sources: violation.sources,
      })),
  );
  const constraintAnalysis = evaluateConstraintGraphFn({
    fields: normalized.fields,
    provenance,
    criticalFieldSet: categoryConfig.criticalFieldSet,
    crossValidationFailures: compoundFailures,
  });

  return {
    manufacturerSources,
    manufacturerMajorConflicts,
    endpointMining,
    constraintAnalysis,
  };
}
