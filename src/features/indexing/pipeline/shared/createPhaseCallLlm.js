// WHY: Generic factory for pipeline phase LLM call adapters.
// Extracts the identical wiring shared by all adapters (brandResolver,
// searchPlanBuilder, serpSelector, queryPlanner, imageFinder, evaluator, etc.)
// so new LLM phases cost ~15 lines instead of ~40.

/**
 * @typedef {object} UsageSummary
 * @property {number} prompt_tokens
 * @property {number} completion_tokens
 * @property {number} total_tokens
 * @property {number} cost_usd
 * @property {boolean} estimated_usage - true when API didn't return tokens (fallback estimate)
 */

export function createPhaseCallLlm({ callRoutedLlmFn, config, logger, onPhaseChange, onModelResolved, onStreamChunk, onQueueWait, signal, onUsage: depsOnUsage }, { phase, reason, role, system, jsonSchema }, mapArgs) {
  return async (domainArgs) => {
    const resolvedSystem = typeof system === 'function' ? system(domainArgs) : system;
    const resolvedSchema = typeof jsonSchema === 'function' ? jsonSchema() : jsonSchema;
    const mapped = mapArgs(domainArgs, config);

    // WHY: Capture token usage from the LLM client's onUsage callback.
    // Compose with any existing onUsage from mapArgs (e.g., cost ledger) — never suppress it.
    // Accumulate across multiple firings (two-phase writer calls onUsage twice).
    /** @type {UsageSummary|null} */
    let capturedUsage = null;
    const captureUsage = (u) => {
      if (!capturedUsage) {
        capturedUsage = { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens, cost_usd: u.cost_usd, estimated_usage: Boolean(u.estimated_usage) };
      } else {
        capturedUsage.prompt_tokens += u.prompt_tokens;
        capturedUsage.completion_tokens += u.completion_tokens;
        capturedUsage.total_tokens += u.total_tokens;
        capturedUsage.cost_usd += u.cost_usd;
        capturedUsage.estimated_usage = capturedUsage.estimated_usage || Boolean(u.estimated_usage);
      }
    };
    const originalOnUsage = mapped.onUsage || depsOnUsage;
    const composedOnUsage = originalOnUsage
      ? async (u) => { await originalOnUsage(u); captureUsage(u); }
      : captureUsage;

    const result = await callRoutedLlmFn({
      config, reason, role, phase,
      system: resolvedSystem,
      jsonSchema: resolvedSchema,
      logger,
      onPhaseChange,
      onModelResolved,
      onStreamChunk,
      onQueueWait,
      signal,
      ...mapped,
      onUsage: composedOnUsage,
    });
    return { result, usage: capturedUsage };
  };
}
