// WHY: RDF integration — asserts the universal discovery-log helper is wired
// via per-module toggles (urlHistoryEnabled / queryHistoryEnabled). Flags off →
// prompt has no "Previous searches" block. Flags on → only matching-variant
// URLs/queries appear (no leakage from other variants).

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { buildReleaseDateFinderPrompt } from '../releaseDateLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';

const runs = [
  {
    ran_at: '2026-01-01T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black',
      discovery_log: { urls_checked: ['https://mfr.com/black'], queries_run: ['black release'] },
    },
  },
  {
    ran_at: '2026-02-01T00:00:00Z',
    response: {
      variant_id: 'v_white', variant_key: 'color:white',
      discovery_log: { urls_checked: ['https://mfr.com/white'], queries_run: ['white release'] },
    },
  },
];

function matcher(variant) {
  return (r) => {
    const rId = r.response?.variant_id;
    const rKey = r.response?.variant_key;
    return (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
  };
}

describe('RDF discovery history — integration', () => {
  const product = { brand: 'Corsair', model: 'M75' };
  const variant = { variant_id: 'v_black', key: 'color:black', label: 'Black' };

  it('flags off → no "Previous searches" block in prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant),
      includeUrls: false,
      includeQueries: false,
    });
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: variant.label, previousDiscovery: acc,
    });
    ok(!prompt.includes('Previous searches'), 'prompt must omit block when both toggles off');
  });

  it('URL on, query off → prompt includes URLs, not queries; and only matching variant', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant),
      includeUrls: true,
      includeQueries: false,
    });
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: variant.label, previousDiscovery: acc,
    });
    ok(prompt.includes('URLs already checked'));
    ok(prompt.includes('https://mfr.com/black'));
    ok(!prompt.includes('https://mfr.com/white'), 'other variant URLs must not leak');
    ok(!prompt.includes('Queries already run'));
  });

  it('both on → prompt includes both URL and query lines from matching variant only', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: variant.label, previousDiscovery: acc,
    });
    ok(prompt.includes('URLs already checked'));
    ok(prompt.includes('Queries already run'));
    ok(prompt.includes('black release'));
    ok(!prompt.includes('white release'), 'other variant queries must not leak');
  });

  it('uses scope label "this variant"', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: variant.label, previousDiscovery: acc,
    });
    ok(prompt.includes('Previous searches for this variant'));
  });
});
