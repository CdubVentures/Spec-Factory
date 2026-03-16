export function buildLearningGateContext({
  fieldOrder,
  fields,
  provenance,
  category,
  runId,
  runtimeFieldRulesEngine,
  config,
  logger,
  evaluateFieldLearningGates,
  emitLearningGateEvents,
} = {}) {
  return {
    fieldOrder,
    fields,
    provenance,
    category,
    runId,
    runtimeFieldRulesEngine,
    config,
    logger,
    evaluateFieldLearningGatesFn: evaluateFieldLearningGates,
    emitLearningGateEventsFn: emitLearningGateEvents,
  };
}
