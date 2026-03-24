// WHY: Contract tests for Brand Resolver (Stage 02) after Phase 2 refactoring.
// Originally characterization tests, now transitioned to assert the new contract:
// pure return (no categoryConfig mutation), registry-driven settings, no dead fields.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runBrandResolver } from '../runBrandResolver.js';
import { resolveBrandDomain } from '../resolveBrandDomain.js';

function createMockLogger() {
  const calls = { info: [], warn: [], debug: [] };
  return {
    info: (event, payload) => calls.info.push({ event, payload }),
    warn: (event, payload) => calls.warn.push({ event, payload }),
    debug: (event, payload) => calls.debug.push({ event, payload }),
    calls,
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
  confidence: 0.8,
  reasoning: ['test reasoning'],
});

const EMPTY_BRAND_RESOLUTION = Object.freeze({
  officialDomain: '',
  aliases: [],
  supportDomain: '',
  confidence: null,
  reasoning: [],
});

function mockResolveFn(result = RESOLVED_BRAND) {
  return async () => ({ ...result });
}

describe('Stage 02 Brand Resolver — Contract', { concurrency: false }, () => {

  it('#1 happy path: returns { brandResolution }', async () => {
    const logger = createMockLogger();
    const result = await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger,
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: mockResolveFn(),
    });

    assert.ok(result.brandResolution, 'should have brandResolution');
    assert.deepEqual(result.brandResolution, RESOLVED_BRAND);
  });

  it('#2 no brand: brandResolution null', async () => {
    const logger = createMockLogger();
    const result = await runBrandResolver({
      job: { brand: '', identityLock: {} },
      category: 'mouse',
      config: {},
      storage: null,
      logger,
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: async () => { throw new Error('should not be called'); },
    });

    assert.equal(result.brandResolution, null);
  });

  it('#3 resolveBrandDomainFn throws: null result', async () => {
    const logger = createMockLogger();
    const result = await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger,
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: async () => { throw new Error('LLM exploded'); },
    });

    assert.equal(result.brandResolution, null);
  });

  it('#4 confidence comes from LLM response, not a hardcoded default', async () => {
    const result = await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: mockResolveFn({ ...RESOLVED_BRAND, confidence: 0.92 }),
    });

    assert.equal(result.brandResolution.confidence, 0.92);
  });

  it('#5 stage returns only the public brandResolution payload', async () => {
    const result = await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: mockResolveFn(),
    });

    assert.equal(Object.hasOwn(result, 'brandResolution'), true);
    assert.deepEqual(result.brandResolution, RESOLVED_BRAND);
  });

  it('#6 stage does NOT mutate categoryConfig.sourceRegistry', async () => {
    const originalSourceRegistry = {};
    const categoryConfig = createCategoryConfig({ sourceRegistry: originalSourceRegistry });

    await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig,
      resolveBrandDomainFn: mockResolveFn(),
    });

    assert.deepEqual(originalSourceRegistry, {});
  });

  it('#7 stage does NOT mutate categoryConfig.sourceHosts', async () => {
    const originalSourceHosts = [];
    const categoryConfig = createCategoryConfig({ sourceHosts: originalSourceHosts });

    await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger: createMockLogger(),
      categoryConfig,
      resolveBrandDomainFn: mockResolveFn(),
    });

    assert.deepEqual(originalSourceHosts, []);
  });

  it('#8 core resolveBrandDomain: LLM error returns the empty resolution contract', async () => {
    const result = await resolveBrandDomain({
      brand: 'TestBrand',
      category: 'mouse',
      config: {},
      callLlmFn: async () => { throw new Error('LLM crash'); },
      storage: null,
      logger: createMockLogger(),
    });

    assert.deepEqual(result, EMPTY_BRAND_RESOLUTION);
  });
});
