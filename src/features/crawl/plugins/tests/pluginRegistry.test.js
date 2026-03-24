import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlugins, PLUGIN_REGISTRY } from '../pluginRegistry.js';

describe('PLUGIN_REGISTRY', () => {
  it('contains stealth, autoScroll, and screenshot', () => {
    assert.ok(PLUGIN_REGISTRY.stealth, 'stealth registered');
    assert.ok(PLUGIN_REGISTRY.autoScroll, 'autoScroll registered');
    assert.ok(PLUGIN_REGISTRY.screenshot, 'screenshot registered');
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
    const result = resolvePlugins(['stealth', 'autoScroll', 'screenshot']);
    assert.equal(result.length, 3);
    assert.equal(result[0].name, 'stealth');
    assert.equal(result[1].name, 'autoScroll');
    assert.equal(result[2].name, 'screenshot');
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
