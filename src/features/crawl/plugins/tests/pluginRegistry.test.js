import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlugins, resolveAllPlugins, PLUGIN_REGISTRY } from '../pluginRegistry.js';

describe('PLUGIN_REGISTRY', () => {
  it('contains stealth, cookieConsent, autoScroll, domExpansion, and cssOverride', () => {
    assert.ok(PLUGIN_REGISTRY.stealth, 'stealth registered');
    assert.ok(PLUGIN_REGISTRY.cookieConsent, 'cookieConsent registered');
    assert.ok(PLUGIN_REGISTRY.autoScroll, 'autoScroll registered');
    assert.ok(PLUGIN_REGISTRY.domExpansion, 'domExpansion registered');
    assert.ok(PLUGIN_REGISTRY.cssOverride, 'cssOverride registered');
  });

  it('each entry has name and hooks', () => {
    for (const [key, plugin] of Object.entries(PLUGIN_REGISTRY)) {
      assert.equal(typeof plugin.name, 'string', `${key} has name`);
      assert.equal(typeof plugin.hooks, 'object', `${key} has hooks`);
    }
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(PLUGIN_REGISTRY));
  });
});

describe('resolvePlugins', () => {
  it('resolves known plugin names to plugin objects', () => {
    const result = resolvePlugins(['stealth', 'cookieConsent', 'autoScroll', 'domExpansion', 'cssOverride']);
    assert.equal(result.length, 5);
    assert.equal(result[0].name, 'stealth');
    assert.equal(result[1].name, 'cookieConsent');
    assert.equal(result[2].name, 'autoScroll');
    assert.equal(result[3].name, 'domExpansion');
    assert.equal(result[4].name, 'cssOverride');
  });

  it('skips unknown names and warns', () => {
    const warnings = [];
    const logger = { warn: (msg, data) => warnings.push({ msg, data }) };
    const result = resolvePlugins(['stealth', 'doesNotExist'], { logger });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'stealth');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].data.name, 'doesNotExist');
  });

  it('returns empty array for empty input', () => {
    const result = resolvePlugins([]);
    assert.deepEqual(result, []);
  });

  it('returns empty array for all unknown names', () => {
    const result = resolvePlugins(['fake1', 'fake2']);
    assert.deepEqual(result, []);
  });

  it('tolerates missing logger', () => {
    const result = resolvePlugins(['unknown']);
    assert.deepEqual(result, []);
  });
});

describe('resolveAllPlugins', () => {
  it('returns all registered plugins', () => {
    const all = resolveAllPlugins();
    assert.equal(all.length, Object.keys(PLUGIN_REGISTRY).length);
    const names = all.map((p) => p.name);
    assert.ok(names.includes('stealth'));
    assert.ok(names.includes('cookieConsent'));
    assert.ok(names.includes('autoScroll'));
    assert.ok(names.includes('domExpansion'));
    assert.ok(names.includes('cssOverride'));
  });
});
