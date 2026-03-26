import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stealthPlugin, STEALTH_PATCHES } from '../plugins/stealthPlugin.js';
import { createPageDouble } from './factories/crawlTestDoubles.js';

describe('stealthPlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(stealthPlugin.name, 'stealth');
    assert.equal(typeof stealthPlugin.hooks.beforeNavigate, 'function');
  });

  it('calls page.addInitScript with stealth script', async () => {
    const page = createPageDouble();
    await stealthPlugin.hooks.beforeNavigate({ page, settings: {} });
    assert.ok(page.initScripts.length >= 1, 'should inject at least one init script');
    assert.ok(page.initScripts[0].includes('webdriver'), 'should hide webdriver');
  });

  it('uses custom UA from settings when provided', async () => {
    const page = createPageDouble();
    const settings = { userAgent: 'CustomBot/1.0' };
    await stealthPlugin.hooks.beforeNavigate({ page, settings });
    assert.ok(page.initScripts.length >= 1);
  });

  it('works with default settings (no UA override)', async () => {
    const page = createPageDouble();
    await stealthPlugin.hooks.beforeNavigate({ page, settings: {} });
    assert.ok(page.initScripts.length >= 1);
  });

  it('returns disabled result when stealthEnabled is false', async () => {
    const page = createPageDouble();
    const result = await stealthPlugin.hooks.beforeNavigate({ page, settings: { stealthEnabled: false } });
    assert.equal(result.enabled, false);
    assert.equal(result.injected, false);
    assert.deepEqual(result.patches, []);
    assert.equal(page.initScripts.length, 0, 'should not inject when disabled');
  });

  it('returns enabled result with all 12 stealth patches', async () => {
    const page = createPageDouble();
    const result = await stealthPlugin.hooks.beforeNavigate({ page, settings: { stealthEnabled: true } });
    assert.equal(result.enabled, true);
    assert.equal(result.injected, true);
    assert.equal(result.patches.length, 12);
    assert.deepEqual(result.patches, STEALTH_PATCHES);
  });

  it('exports STEALTH_PATCHES with all 12 patch names', () => {
    const expected = [
      'toString', 'webdriver', 'vendor', 'plugins', 'languages',
      'hardwareConcurrency', 'chromeRuntime', 'chromeApp',
      'chromeCsi', 'chromeLoadTimes', 'permissions', 'webglVendor',
    ];
    assert.deepEqual(STEALTH_PATCHES, expected);
  });

  it('injected script contains all critical patch markers', async () => {
    const page = createPageDouble();
    await stealthPlugin.hooks.beforeNavigate({ page, settings: { stealthEnabled: true } });
    const script = page.initScripts[0];
    assert.ok(script.includes('webdriver'), 'missing webdriver patch');
    assert.ok(script.includes('vendor'), 'missing vendor patch');
    assert.ok(script.includes('hardwareConcurrency'), 'missing hardwareConcurrency patch');
    assert.ok(script.includes('chrome'), 'missing chrome stubs');
    assert.ok(script.includes('permissions'), 'missing permissions patch');
    assert.ok(script.includes('WebGLRenderingContext'), 'missing WebGL patch');
    assert.ok(script.includes('toString'), 'missing toString protection');
    assert.ok(script.includes('Chrome PDF Plugin'), 'missing realistic plugins');
  });
});
