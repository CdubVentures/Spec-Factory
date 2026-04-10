// WHY: Generic factory for pipeline phase LLM call adapters.
// Extracts the identical wiring shared by all 4 adapters (brandResolver,
// searchPlanBuilder, serpSelector, queryPlanner) so new LLM phases cost
// ~15 lines instead of ~40.

export function createPhaseCallLlm({ callRoutedLlmFn, config, logger, onPhaseChange }, { phase, reason, role, system, jsonSchema }, mapArgs) {
  return async (domainArgs) => {
    const resolvedSystem = typeof system === 'function' ? system(domainArgs) : system;
    const resolvedSchema = typeof jsonSchema === 'function' ? jsonSchema() : jsonSchema;
    const mapped = mapArgs(domainArgs, config);
    return callRoutedLlmFn({
      config, reason, role, phase,
      system: resolvedSystem,
      jsonSchema: resolvedSchema,
      logger,
      onPhaseChange,
      ...mapped,
    });
  };
}
