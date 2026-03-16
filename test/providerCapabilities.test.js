import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderCapabilities,
  supportsOperator,
  listProviders,
  providerCapabilitySchema,
} from '../src/features/indexing/discovery/providerCapabilities.js';

describe('providerCapabilities', () => {
  it('listProviders returns all known providers', () => {
    const providers = listProviders();
    assert.ok(providers.includes('searxng'));
    assert.ok(providers.includes('google'));
    assert.ok(providers.includes('bing'));
    assert.ok(providers.includes('dual'));
    assert.ok(providers.includes('none'));
  });

  it('each provider validates against schema', () => {
    for (const name of listProviders()) {
      const caps = getProviderCapabilities(name);
      const result = providerCapabilitySchema.safeParse(caps);
      assert.ok(result.success, `${name} failed schema: ${JSON.stringify(result.error?.issues)}`);
    }
  });

  it('SearXNG supports site operator', () => {
    assert.equal(supportsOperator('searxng', 'site'), true);
  });

  it('Google supports all standard operators', () => {
    for (const op of ['site', 'filetype', 'intitle', 'inurl']) {
      assert.equal(supportsOperator('google', op), true, `google should support ${op}`);
    }
  });

  it('Bing supports filetype', () => {
    assert.equal(supportsOperator('bing', 'filetype'), true);
  });

  it('Dual exposes the safe shared operator subset', () => {
    assert.equal(supportsOperator('dual', 'site'), true);
    assert.equal(supportsOperator('dual', 'filetype'), true);
    assert.equal(supportsOperator('dual', 'since'), false);
  });

  it('unknown provider throws', () => {
    assert.throws(() => getProviderCapabilities('askjeeves'), /unknown provider/i);
  });

  it('unknown operator returns false', () => {
    assert.equal(supportsOperator('google', 'nonexistent_op'), false);
  });

  it('capability objects are frozen', () => {
    const caps = getProviderCapabilities('google');
    assert.throws(() => { caps.supports_site = false; }, /Cannot assign/);
  });
});
