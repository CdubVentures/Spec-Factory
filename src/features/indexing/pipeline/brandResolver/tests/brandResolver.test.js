import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrandDomain } from '../resolveBrandDomain.js';

function makeResolvedDomain(overrides = {}) {
  return {
    official_domain: 'cougargaming.com',
    aliases: ['cougargaming.com', 'cougar-gaming.com'],
    support_domain: 'support.cougargaming.com',
    ...overrides,
  };
}

function makeResolveArgs(overrides = {}) {
  return {
    brand: 'Cougar',
    category: 'mouse',
    config: { llmModelPlan: 'test-model' },
    storage: {},
    callLlmFn: async () => makeResolvedDomain(),
    ...overrides,
  };
}

describe('brandResolver', () => {
  it('returns the normalized brand resolution contract from the LLM result', async () => {
    const result = await resolveBrandDomain(makeResolveArgs());

    assert.equal(result.officialDomain, 'cougargaming.com');
    assert.ok(Array.isArray(result.aliases));
    assert.ok(result.aliases.includes('cougargaming.com'));
    assert.equal(result.supportDomain, 'support.cougargaming.com');
  });

  it('LLM failure falls back to the empty resolution contract', async () => {
    const result = await resolveBrandDomain(makeResolveArgs({
      brand: 'Unknown',
      callLlmFn: async () => {
        throw new Error('LLM unavailable');
      },
    }));

    assert.equal(result.officialDomain, '');
    assert.deepEqual(result.aliases, []);
    assert.equal(result.supportDomain, '');
    assert.equal(result.confidence, null);
    assert.deepEqual(result.reasoning, []);
  });

  it('resolved aliases flow through selectManufacturerHosts', async () => {
    const { buildSearchProfile } = await import('../../searchProfile/index.js');
    const profile = buildSearchProfile({
      job: {
        identityLock: { brand: 'Cougar', base_model: 'AirBlader Tournament', model: 'AirBlader Tournament', variant: '' },
        category: 'mouse'
      },
      categoryConfig: {
        category: 'mouse',
        sourceHosts: [
          { host: 'cougargaming.com', role: 'manufacturer' },
          { host: 'cougar.com', role: 'manufacturer' },
          { host: 'razer.com', role: 'manufacturer' }
        ]
      },
      missingFields: ['weight'],
      brandResolution: {
        officialDomain: 'cougargaming.com',
        aliases: ['cougargaming.com', 'cougar-gaming.com'],
        supportDomain: 'support.cougargaming.com'
      }
    });
    // WHY: soft domain bias — host appears as plain text, not site: operator
    const hostBiasedQueries = profile.queries.filter(q => q.includes('cougargaming.com') && !q.includes('site:'));
    assert.ok(hostBiasedQueries.length > 0, `Expected cougargaming.com soft bias in queries: ${JSON.stringify(profile.queries)}`);
  });
});
