// WHY: Classify hint tokens into host/tier/intent/unresolved for exit gate
// requirement: "every hint token becomes host/tier/intent/unresolved."

import { isValidDomain, normalizeHost } from './hostParser.js';
import { lookupSource } from './sourceRegistry.js';

const TIER_NAMES = new Set([
  'manufacturer', 'lab', 'database', 'retailer', 'community', 'aggregator',
]);

const INTENT_NAMES = new Set([
  'manual', 'datasheet', 'spec', 'specification', 'specifications',
  'review', 'benchmark', 'teardown', 'comparison', 'product_page',
  'press_release', 'firmware', 'software', 'driver',
]);

const EMPTY_TOKEN = Object.freeze({
  raw: '',
  classification: 'unresolved',
  host: null,
  tier: null,
  intent: null,
  source_entry: null,
});

/**
 * Classify a single hint value.
 *
 * Classification rules (in priority order):
 * 1. Contains "." + matches registry → host (source_entry populated)
 * 2. Contains "." + passes isValidDomain but no registry match → host (source_entry=null)
 * 3. Matches tier name → tier
 * 4. Matches content type → intent
 * 5. Otherwise → unresolved
 */
export function resolveHintToken(hintValue, registry) {
  const raw = String(hintValue ?? '').trim().toLowerCase();
  if (!raw) return { ...EMPTY_TOKEN };

  // Host path: contains a dot — could be domain
  if (raw.includes('.')) {
    const host = normalizeHost(raw);
    if (isValidDomain(raw)) {
      const entry = lookupSource(registry, host);
      return {
        raw,
        classification: 'host',
        host: host || raw,
        tier: null,
        intent: null,
        source_entry: entry,
      };
    }
    // Not a valid domain (e.g. "v2.0") → fall through to other checks
  }

  // Tier path
  if (TIER_NAMES.has(raw)) {
    return {
      raw,
      classification: 'tier',
      host: null,
      tier: raw,
      intent: null,
      source_entry: null,
    };
  }

  // Intent path
  if (INTENT_NAMES.has(raw)) {
    return {
      raw,
      classification: 'intent',
      host: null,
      tier: null,
      intent: raw,
      source_entry: null,
    };
  }

  // Unresolved
  return {
    raw,
    classification: 'unresolved',
    host: null,
    tier: null,
    intent: null,
    source_entry: null,
  };
}

/**
 * Batch-classify an array of hint values.
 */
export function resolveHintTokens(hintValues, registry) {
  return (hintValues || []).map(v => resolveHintToken(v, registry));
}
