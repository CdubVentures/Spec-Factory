import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stealthPlugin } from '../plugins/stealthPlugin.js';
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

  it('returns enabled result with patches when stealthEnabled is true', async () => {
    const page = createPageDouble();
    const result = await stealthPlugin.hooks.beforeNavigate({ page, settings: { stealthEnabled: true } });
    assert.equal(result.enabled, true);
    assert.equal(result.injected, true);
    assert.ok(result.patches.length > 0);
  });
});
