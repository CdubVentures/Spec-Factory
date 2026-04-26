// WHY: Canonical LLM-call tracking wrapper. Direct/test callers use this for
// pending-before / completed-after onLlmCallComplete emissions. Routed LLM
// callers already emit their own rows, so delegated mode suppresses wrapper
// emissions to avoid stale duplicate pending rows.
// Direct callers still alternate pending/completed wrapper emissions. Routed
// callers pass emitCompleted:false so the router owns pending/completed/failure
// telemetry, including fallback and writer-phase rows.

const EMPTY_TIER_CAPS = Object.freeze({
  thinking: false,
  webSearch: false,
  effortLevel: '',
});

/**
 * Wrap an LLM call with canonical timing and optional pending/completed emission.
 *
 * @param {object} opts
 * @param {string} opts.label             'Discovery' | 'Identity Check' | …
 * @param {{system: string, user: string}} opts.prompt
 * @param {string} [opts.initialModel]    shown in pending row; defaults to modelTracking.configModel
 * @param {{thinking: boolean, webSearch: boolean, effortLevel: string}} [opts.tierCapabilities]
 * @param {object} opts.modelTracking     from resolveModelTracking(...)
 * @param {Function} [opts.onLlmCallComplete]  downstream callback; no-op if undefined
 * @param {() => Promise<{result: any, usage: any}>} opts.callFn
 * @param {boolean} [opts.emitCompleted=true] false when routed telemetry owns the completed/failure row
 * @param {boolean} [opts.emitPending=opts.emitCompleted] false when routed telemetry owns the pending row
 * @param {object} [opts.extras]          tier / reason / variant / … spread into BOTH emissions
 * @returns {Promise<{result: any, usage: any, durationMs: number}>}
 */
export async function withLlmCallTracking({
  label,
  prompt,
  initialModel,
  tierCapabilities,
  modelTracking,
  onLlmCallComplete,
  callFn,
  extras = {},
  emitCompleted = true,
  emitPending = emitCompleted,
}) {
  const resolvedInitialModel = initialModel || modelTracking?.configModel || '';
  const caps = tierCapabilities || EMPTY_TIER_CAPS;

  // WHY: Spread extras FIRST so intrinsic fields (label, prompt, response,
  // model, usage, started_at, duration_ms) overwrite any colliding extras key.
  // A buggy caller passing `extras: { response: 'oops' }` must NOT corrupt the
  // pending/completed shape the modal reads.
  if (emitPending) {
    onLlmCallComplete?.({
      ...extras,
      label,
      prompt,
      response: null,
      model: resolvedInitialModel,
      isFallback: false,
      thinking: caps.thinking,
      webSearch: caps.webSearch,
      effortLevel: caps.effortLevel,
      accessMode: '',
    });
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const callResult = await callFn();
  const durationMs = Date.now() - startMs;
  const result = callResult?.result;
  const usage = callResult?.usage ?? null;

  if (emitCompleted) {
    onLlmCallComplete?.({
      ...extras,
      label,
      prompt,
      response: result,
      model: modelTracking.actualModel || resolvedInitialModel,
      isFallback: modelTracking.actualFallbackUsed,
      thinking: modelTracking.actualThinking,
      webSearch: modelTracking.actualWebSearch,
      effortLevel: modelTracking.actualEffortLevel,
      accessMode: modelTracking.actualAccessMode,
      usage,
      started_at: startedAt,
      duration_ms: durationMs,
    });
  }

  return { result, usage, durationMs, startedAt };
}
