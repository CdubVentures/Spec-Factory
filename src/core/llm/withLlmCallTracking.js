// WHY: Canonical LLM-call tracking wrapper. Replaces the ~30 LOC of duplicated
// pending-before / completed-after onLlmCallComplete emission code that every
// finder orchestrator (keyFinder, variantScalarFieldProducer, CEF) hand-rolled.
// Called once per conceptual LLM call — keyFinder 1×, RDF/SKU 1× per variant,
// CEF 2× (Discovery + Identity Check). PIF stays on its own bespoke wiring.
//
// Relies on appendLlmCall's upsert rule (src/core/operations/operationsRegistry.js
// lines 223-247): the registry merges a call into the last row only when
// `last.response === null && call.response != null`. Sequential awaits of this
// wrapper naturally alternate pending → completed → pending → completed, so
// consecutive multi-call orchestrators (CEF) produce distinct rows per label.

const EMPTY_TIER_CAPS = Object.freeze({
  thinking: false,
  webSearch: false,
  effortLevel: '',
});

/**
 * Wrap an LLM call with canonical pending + completed emission.
 *
 * @param {object} opts
 * @param {string} opts.label             'Discovery' | 'Identity Check' | …
 * @param {{system: string, user: string}} opts.prompt
 * @param {string} [opts.initialModel]    shown in pending row; defaults to modelTracking.configModel
 * @param {{thinking: boolean, webSearch: boolean, effortLevel: string}} [opts.tierCapabilities]
 * @param {object} opts.modelTracking     from resolveModelTracking(...)
 * @param {Function} [opts.onLlmCallComplete]  downstream callback; no-op if undefined
 * @param {() => Promise<{result: any, usage: any}>} opts.callFn
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
}) {
  const resolvedInitialModel = initialModel || modelTracking?.configModel || '';
  const caps = tierCapabilities || EMPTY_TIER_CAPS;

  // WHY: Spread extras FIRST so intrinsic fields (label, prompt, response,
  // model, usage, started_at, duration_ms) overwrite any colliding extras key.
  // A buggy caller passing `extras: { response: 'oops' }` must NOT corrupt the
  // pending/completed shape the modal reads.
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

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const callResult = await callFn();
  const durationMs = Date.now() - startMs;
  const result = callResult?.result;
  const usage = callResult?.usage ?? null;

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

  return { result, usage, durationMs, startedAt };
}
