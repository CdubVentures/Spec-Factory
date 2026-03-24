// WHY: Contract tests for Brand Resolver (Stage 02) after Phase 2 refactoring.
// Originally characterization tests, now transitioned to assert the new contract:
// pure return (no categoryConfig mutation), registry-driven settings, no dead fields.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runBrandResolver } from '../src/features/indexing/pipeline/brandResolver/runBrandResolver.js';
import { resolveBrandDomain } from '../src/features/indexing/pipeline/brandResolver/resolveBrandDomain.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';

const reg = (key) => RUNTIME_SETTINGS_REGISTRY.find((e) => e.key === key);

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
    assert.equal(result.brandResolution.officialDomain, 'testbrand.com');

    const brandEvent = logger.calls.info.find((c) => c.event === 'brand_resolved');
    assert.ok(brandEvent, 'should emit brand_resolved event');
    assert.equal(brandEvent.payload.status, 'resolved');
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

    const brandEvent = logger.calls.info.find((c) => c.event === 'brand_resolved');
    assert.ok(brandEvent);
    assert.equal(brandEvent.payload.status, 'skipped');
    assert.equal(brandEvent.payload.skip_reason, 'no_brand_in_identity_lock');
  });

  it('#3 resolveBrandDomainFn throws: null result, warning logged, failed status', async () => {
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

    const warnCall = logger.calls.warn.find((c) => c.event === 'brand_resolution_failed');
    assert.ok(warnCall, 'should log brand_resolution_failed warning');
    assert.ok(warnCall.payload.error.includes('LLM exploded'));

    const brandEvent = logger.calls.info.find((c) => c.event === 'brand_resolved');
    assert.equal(brandEvent.payload.status, 'failed');
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

  it('#5 brand_resolved event does NOT include candidates field', async () => {
    const logger = createMockLogger();
    await runBrandResolver({
      job: { brand: 'TestBrand', identityLock: { brand: 'TestBrand' } },
      category: 'mouse',
      config: {},
      storage: null,
      logger,
      categoryConfig: createCategoryConfig(),
      resolveBrandDomainFn: mockResolveFn(),
    });

    const brandEvent = logger.calls.info.find((c) => c.event === 'brand_resolved');
    assert.equal('candidates' in brandEvent.payload, false, 'candidates should not be in event');
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

    const keys = Object.keys(originalSourceRegistry);
    assert.equal(keys.length, 0, 'sourceRegistry should NOT be mutated by stage');
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

    assert.equal(originalSourceHosts.length, 0, 'original sourceHosts should be unchanged');
  });

  it('#8 core resolveBrandDomain: LLM error IS logged via logger', async () => {
    const logger = createMockLogger();
    const result = await resolveBrandDomain({
      brand: 'TestBrand',
      category: 'mouse',
      config: {},
      callLlmFn: async () => { throw new Error('LLM crash'); },
      storage: null,
      logger,
    });

    assert.equal(result.officialDomain, '');
    assert.equal(result.confidence, null);

    const warnCall = logger.calls.warn.find((c) => c.event === 'brand_resolver_llm_error');
    assert.ok(warnCall, 'should log brand_resolver_llm_error warning');
    assert.ok(warnCall.payload.error.includes('LLM crash'));
  });
});
