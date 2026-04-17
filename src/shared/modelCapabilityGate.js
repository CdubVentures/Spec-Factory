// WHY: Shared SSOT for masking stored phase-override values by what the selected
// model actually supports. Prevents stale toggles (e.g. thinking=true left over
// from a prior lab-model selection) from leaking through to backend LLM calls
// or frontend display badges when the current model can't honor them.
//
// Pure function: callers look up capabilities from their own registry shape
// (backend lookup vs frontend array) and pass them in.

/**
 * Mask stored phase-override values by the target model's declared capabilities.
 *
 * @param {object} stored — raw override values ({ thinking, thinkingEffort, webSearch })
 * @param {object|null|undefined} capabilities — model's declared caps ({ thinking?, webSearch?, thinkingEffortOptions? })
 * @returns {{ thinking: boolean, thinkingEffort: string, webSearch: boolean }}
 */
export function gateCapabilities(stored = {}, capabilities = null) {
  const supportsThinking = Boolean(capabilities?.thinking);
  const supportsWebSearch = Boolean(capabilities?.webSearch);
  return {
    thinking: Boolean(stored?.thinking) && supportsThinking,
    webSearch: Boolean(stored?.webSearch) && supportsWebSearch,
    thinkingEffort: supportsThinking ? String(stored?.thinkingEffort || '') : '',
  };
}

/**
 * Backend helper: extract capabilities for a model via the registry lookup
 * produced by buildRegistryLookup (src/core/llm/routeResolver.js).
 *
 * @param {object|null} lookup — registry lookup with compositeIndex + modelIndex
 * @param {string} modelKey — composite ("providerId:modelId") or bare modelId
 * @returns {{ thinking: boolean, webSearch: boolean, thinkingEffortOptions: string[] } | null}
 */
export function capabilitiesFromLookup(lookup, modelKey) {
  if (!lookup || !modelKey) return null;
  const key = String(modelKey).trim();
  if (!key) return null;

  let route = null;
  const colonIdx = key.indexOf(':');
  if (colonIdx > 0) {
    route = lookup.compositeIndex?.get(key) || null;
  } else {
    const routes = lookup.modelIndex?.get(key);
    route = (routes && routes.length) ? routes[0] : null;
  }
  if (!route) return null;

  const meta = route.modelMeta || {};
  return {
    thinking: Boolean(meta.thinking),
    webSearch: Boolean(meta.webSearch),
    thinkingEffortOptions: Array.isArray(meta.thinkingEffortOptions) ? meta.thinkingEffortOptions : [],
  };
}
