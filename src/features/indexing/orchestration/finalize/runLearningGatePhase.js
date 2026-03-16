export function runLearningGatePhase({
  fieldOrder = [],
  fields = {},
  provenance = {},
  category = '',
  runId = '',
  runtimeFieldRulesEngine = null,
  config = {},
  logger,
  evaluateFieldLearningGatesFn,
  emitLearningGateEventsFn,
} = {}) {
  const learningGateResult = evaluateFieldLearningGatesFn({
    fieldOrder,
    fields,
    provenance,
    category,
    runId,
    fieldRulesEngine: runtimeFieldRulesEngine,
    config,
  });

  emitLearningGateEventsFn({
    gateResults: learningGateResult.gateResults,
    logger,
    runId,
  });

  return learningGateResult;
}
