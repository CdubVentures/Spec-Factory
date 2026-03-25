import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runBrandResolver } from '../runBrandResolver.js';

function createMockLogger() {
  return {
    info() {},
    warn() {},
    debug() {},
  };
}

function createCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [],
    sourceHostMap: new Map(),
    approvedRootDomains: new Set(),
    sourceRegistry: {},
    sources: {},
    ...overrides,
  };
}

const RESOLVED_BRAND = Object.freeze({
  officialDomain: 'testbrand.com',
  aliases: ['testbrand.net'],
  supportDomain: 'support.testbrand.com',
  confidence: 0.92,
  reasoning: ['test reasoning'],
});

function mockResolveFn(result = RESOLVED_BRAND) {
  return async () => ({ ...result });
}

describe('Stage 02 Brand Resolver contract', { concurrency: false }, () => {
  it('returns only the public brandResolution payload on success', async () => {
    const result = await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: mockResolveFn(),
    });

    assert.deepEqual(Object.keys(result).sort(), ['brandResolution']);
    assert.deepEqual(result.brandResolution, RESOLVED_BRAND);
  });

  it('returns null brandResolution when no brand is available', async () => {
    const result = await runBrandResolver({
      job: { brand: '', identityLock: {} },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: async () => ({ officialDomain: 'should-not-surface.com' }),
    });

    assert.deepEqual(result, { brandResolution: null });
  });

  it('returns null brandResolution when the resolver fails', async () => {
    const result = await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: async () => { throw new Error('LLM exploded'); },
    });

    assert.deepEqual(result, { brandResolution: null });
  });
});
