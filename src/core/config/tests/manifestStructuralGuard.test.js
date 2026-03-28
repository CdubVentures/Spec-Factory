import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_MANIFEST,
  CONFIG_MANIFEST_VERSION,
  CONFIG_MANIFEST_KEYS,
  CONFIG_MANIFEST_DEFAULTS,
} from '../manifest.js';

const REQUIRED_ACTIVE_GROUP_IDS = [
  'llm',
  'discovery',
  'runtime',
  'paths',
  'misc',
];

describe('manifest structural guard', () => {
  it('exports version 1', () => {
    assert.equal(CONFIG_MANIFEST_VERSION, 1);
  });

  it('exports a frozen, non-empty manifest array', () => {
    assert.ok(Object.isFrozen(CONFIG_MANIFEST));
    assert.ok(CONFIG_MANIFEST.length > 0);
  });

  it('includes each required manifest group', () => {
    const groupIds = CONFIG_MANIFEST.map((group) => group.id);
    for (const id of REQUIRED_ACTIVE_GROUP_IDS) {
      assert.ok(groupIds.includes(id), `missing manifest group: ${id}`);
    }
  });

  it('gives each group the required public shape', () => {
    for (const group of CONFIG_MANIFEST) {
      assert.equal(typeof group.id, 'string');
      assert.equal(typeof group.title, 'string');
      assert.equal(typeof group.notes, 'string');
      assert.ok(Array.isArray(group.entries));
      assert.ok(group.entries.length > 0, `${group.id} has no entries`);
    }
  });

  it('gives each entry the required public shape', () => {
    const requiredFields = ['key', 'defaultValue', 'type', 'secret', 'userMutable', 'description'];
    for (const group of CONFIG_MANIFEST) {
      for (const entry of group.entries) {
        for (const field of requiredFields) {
          assert.ok(field in entry, `${group.id}/${entry.key || '?'} missing ${field}`);
        }
      }
    }
  });

  it('keeps exported manifest keys and defaults aligned with grouped entries', () => {
    const manifestKeys = CONFIG_MANIFEST.flatMap((group) => group.entries.map((entry) => entry.key));
    const exportedKeys = [...CONFIG_MANIFEST_KEYS];

    assert.equal(exportedKeys.length, new Set(exportedKeys).size, 'CONFIG_MANIFEST_KEYS must be unique');
    assert.deepEqual([...new Set(exportedKeys)].sort(), [...new Set(manifestKeys)].sort());
    assert.equal(Object.keys(CONFIG_MANIFEST_DEFAULTS).length, manifestKeys.length);
  });

  it('keeps manifest keys unique across groups', () => {
    const allKeys = CONFIG_MANIFEST.flatMap((group) => group.entries.map((entry) => entry.key));
    assert.equal(allKeys.length, new Set(allKeys).size);
  });

  it('keeps CONFIG_MANIFEST_DEFAULTS values aligned with entry defaults', () => {
    for (const group of CONFIG_MANIFEST) {
      for (const entry of group.entries) {
        assert.equal(CONFIG_MANIFEST_DEFAULTS[entry.key], entry.defaultValue);
      }
    }
  });

  it('publishes LOCAL_OUTPUT_ROOT in the paths group with a non-empty default', () => {
    const pathsGroup = CONFIG_MANIFEST.find((group) => group.id === 'paths');
    const localOutputRoot = pathsGroup?.entries.find((entry) => entry.key === 'LOCAL_OUTPUT_ROOT');

    assert.ok(localOutputRoot, 'LOCAL_OUTPUT_ROOT not found in paths group');
    assert.equal(typeof localOutputRoot.defaultValue, 'string');
    assert.ok(localOutputRoot.defaultValue.length > 0);
  });
});
