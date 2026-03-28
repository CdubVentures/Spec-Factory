// WHY: Pure derivation of LLM key gate errors from the server-authoritative
// routing_snapshot. Separated from React so it's testable via node --test.

const ROLE_LABELS = Object.freeze({
  plan: 'Needset / Search Planner',
  triage: 'Brand Resolver / SERP Selector',
  extract: 'Extraction',
  validate: 'Validation',
  write: 'Write',
});

/**
 * Derives LLM key gate errors from the routing snapshot.
 * Returns one entry per role that has a model configured but no API key.
 * @param {Record<string, { primary?: { provider?: string, model?: string, api_key_present?: boolean } | null, fallback?: { provider?: string, model?: string, api_key_present?: boolean } | null }> | null | undefined} routingSnapshot
 * @returns {Array<{ role: string, label: string, provider: string, model: string }>}
 */
export function deriveLlmKeyGateErrors(routingSnapshot) {
  if (!routingSnapshot || typeof routingSnapshot !== 'object') return [];

  const errors = [];
  for (const [role, route] of Object.entries(routingSnapshot)) {
    const primary = route?.primary;
    if (!primary) continue;

    const model = String(primary.model || '').trim();
    if (!model) continue;

    if (primary.api_key_present) continue;

    // WHY: If fallback has a key, the pipeline can still function.
    const fallback = route?.fallback;
    if (fallback?.api_key_present) continue;

    errors.push({
      role,
      label: ROLE_LABELS[role] || role,
      provider: String(primary.provider || '').trim(),
      model,
    });
  }

  return errors;
}

/**
 * @param {Parameters<typeof deriveLlmKeyGateErrors>[0]} routingSnapshot
 * @returns {boolean}
 */
export function hasLlmKeyGateErrors(routingSnapshot) {
  return deriveLlmKeyGateErrors(routingSnapshot).length > 0;
}

/**
 * Returns an error object if Serper is enabled but has no API key configured.
 * @param {{ enabled?: boolean, configured?: boolean, credit?: number | null } | null | undefined} serperData
 * @returns {{ role: string, label: string, provider: string, model: string } | null}
 */
export function deriveSerperKeyGateError(serperData) {
  if (!serperData) return null;
  if (!serperData.enabled) return null;
  if (serperData.configured) return null;
  return { role: 'serper', label: 'Serper Search', provider: 'serper', model: '' };
}
