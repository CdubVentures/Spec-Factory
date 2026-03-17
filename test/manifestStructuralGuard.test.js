import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_MANIFEST,
  CONFIG_MANIFEST_VERSION,
  CONFIG_MANIFEST_KEYS,
  CONFIG_MANIFEST_DEFAULTS,
} from '../src/core/config/manifest.js';

describe('manifest structural guard', () => {
  it('exports version 1', () => {
    assert.equal(CONFIG_MANIFEST_VERSION, 1);
  });

  it('CONFIG_MANIFEST is a frozen non-empty array', () => {
    assert.ok(Object.isFrozen(CONFIG_MANIFEST));
    assert.equal(CONFIG_MANIFEST.length > 0, true);
  });

  it('group IDs are in exact expected order', () => {
    const expected = [
      'core', 'caching', 'storage', 'security', 'llm',
      'discovery', 'runtime', 'observability',
      'paths', 'misc',
    ];
    assert.deepStrictEqual(CONFIG_MANIFEST.map(g => g.id), expected);
  });

  it('each group has required shape: id, title, notes, entries', () => {
    for (const group of CONFIG_MANIFEST) {
      assert.equal(typeof group.id, 'string', `group missing id`);
      assert.equal(typeof group.title, 'string', `${group.id} missing title`);
      assert.equal(typeof group.notes, 'string', `${group.id} missing notes`);
      assert.ok(Array.isArray(group.entries), `${group.id} entries not array`);
      assert.ok(group.entries.length > 0, `${group.id} has no entries`);
    }
  });

  it('each entry has required shape: key, defaultValue, type, secret, userMutable, description', () => {
    const requiredFields = ['key', 'defaultValue', 'type', 'secret', 'userMutable', 'description'];
    for (const group of CONFIG_MANIFEST) {
      for (const entry of group.entries) {
        for (const field of requiredFields) {
          assert.ok(field in entry, `${group.id} entry ${entry.key || '?'} missing field: ${field}`);
        }
      }
    }
  });

  it('flattened manifest keys and defaults stay in sync with the grouped manifest', () => {
    const expected = CONFIG_MANIFEST.flatMap((group) => group.entries.map((entry) => entry.key));
    assert.deepStrictEqual([...CONFIG_MANIFEST_KEYS], expected);
    assert.equal(Object.keys(CONFIG_MANIFEST_DEFAULTS).length, expected.length);
  });

  it('no duplicate keys across all groups', () => {
    const allKeys = CONFIG_MANIFEST.flatMap(g => g.entries.map(e => e.key));
    const unique = new Set(allKeys);
    assert.equal(allKeys.length, unique.size, `found ${allKeys.length - unique.size} duplicate keys`);
  });

  it('CONFIG_MANIFEST_DEFAULTS values match group entry defaultValues', () => {
    for (const group of CONFIG_MANIFEST) {
      for (const entry of group.entries) {
        assert.equal(CONFIG_MANIFEST_DEFAULTS[entry.key], entry.defaultValue,
          `default mismatch for ${entry.key}`);
      }
    }
  });

  it('paths group contains LOCAL_OUTPUT_ROOT with dynamic default', () => {
    const pathsGroup = CONFIG_MANIFEST.find(g => g.id === 'paths');
    const localOutputRoot = pathsGroup.entries.find(e => e.key === 'LOCAL_OUTPUT_ROOT');
    assert.ok(localOutputRoot, 'LOCAL_OUTPUT_ROOT not found in paths group');
    assert.equal(typeof localOutputRoot.defaultValue, 'string');
    assert.ok(localOutputRoot.defaultValue.length > 0, 'LOCAL_OUTPUT_ROOT default is empty');
  });
});
