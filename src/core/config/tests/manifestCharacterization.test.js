import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_MANIFEST,
  CONFIG_MANIFEST_DEFAULTS,
  CONFIG_MANIFEST_KEYS,
  CONFIG_MANIFEST_VERSION,
} from '../manifest.js';

const REQUIRED_GROUP_IDS = [
  'core',
  'caching',
  'storage',
  'security',
  'llm',
  'discovery',
  'runtime',
  'observability',
  'paths',
  'misc',
];

describe('manifest contract', () => {
  it('publishes the current manifest version', () => {
    assert.equal(CONFIG_MANIFEST_VERSION, 1);
  });

  it('includes each required manifest group', () => {
    const groupIds = CONFIG_MANIFEST.map((group) => group.id);

    for (const id of REQUIRED_GROUP_IDS) {
      assert.ok(groupIds.includes(id), `missing manifest group: ${id}`);
    }
  });

  it('publishes well-formed entries with unique keys', () => {
    const requiredFields = ['key', 'defaultValue', 'type', 'secret', 'userMutable', 'description'];
    const allKeys = [];

    for (const group of CONFIG_MANIFEST) {
      assert.ok(group.title.length > 0, `${group.id} has empty title`);
      assert.ok(group.notes.length > 0, `${group.id} has empty notes`);

      for (const entry of group.entries) {
        for (const field of requiredFields) {
          assert.ok(field in entry, `${group.id}/${entry.key} missing ${field}`);
        }
        assert.equal(typeof entry.key, 'string');
        assert.equal(typeof entry.defaultValue, 'string');
        assert.equal(typeof entry.type, 'string');
        assert.equal(typeof entry.secret, 'boolean');
        assert.equal(typeof entry.userMutable, 'boolean');
        assert.equal(typeof entry.description, 'string');
        allKeys.push(entry.key);
      }
    }

    assert.equal(allKeys.length, new Set(allKeys).size, 'manifest keys must be unique');
  });

  it('keeps CONFIG_MANIFEST_KEYS aligned with the manifest entry keys', () => {
    const manifestKeys = CONFIG_MANIFEST.flatMap((group) => group.entries.map((entry) => entry.key));
    const manifestKeySet = new Set(manifestKeys);
    const exportedKeySet = new Set(CONFIG_MANIFEST_KEYS);

    assert.equal(CONFIG_MANIFEST_KEYS.length, exportedKeySet.size, 'CONFIG_MANIFEST_KEYS must be unique');
    assert.deepEqual([...exportedKeySet].sort(), [...manifestKeySet].sort());
  });

  it('provides defaults for every exported manifest key', () => {
    for (const key of CONFIG_MANIFEST_KEYS) {
      assert.ok(Object.hasOwn(CONFIG_MANIFEST_DEFAULTS, key), `missing default for ${key}`);
    }
  });
});
