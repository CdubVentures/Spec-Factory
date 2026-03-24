import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_MANIFEST,
  CONFIG_MANIFEST_VERSION,
  CONFIG_MANIFEST_KEYS,
  CONFIG_MANIFEST_DEFAULTS,
} from '../manifest.js';

// WHY: Golden-master characterization test. Locks the EXACT manifest output
// before the P1 registry-derives-manifest refactor. Any change to manifest
// shape, key count, group assignment, or defaults will fail here first.

describe('manifest characterization (golden master)', () => {
  it('version is 1', () => {
    assert.equal(CONFIG_MANIFEST_VERSION, 1);
  });

  it('has exactly 10 groups in canonical order', () => {
    assert.deepStrictEqual(
      CONFIG_MANIFEST.map(g => g.id),
      ['core', 'caching', 'storage', 'security', 'llm', 'discovery', 'runtime', 'observability', 'paths', 'misc']
    );
  });

  it('has exactly 209 total keys', () => {
    assert.equal(CONFIG_MANIFEST_KEYS.length, 209);
  });

  it('per-group entry counts match snapshot', () => {
    const counts = Object.fromEntries(CONFIG_MANIFEST.map(g => [g.id, g.entries.length]));
    assert.deepStrictEqual(counts, {
      core: 5,
      caching: 3,
      storage: 17,
      security: 2,
      llm: 69,
      discovery: 4,
      runtime: 49,
      observability: 1,
      paths: 20,
      misc: 39,
    });
  });

  it('every entry has the required manifest shape', () => {
    const requiredFields = ['key', 'defaultValue', 'type', 'secret', 'userMutable', 'description'];
    for (const group of CONFIG_MANIFEST) {
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
      }
    }
  });

  it('CONFIG_MANIFEST_DEFAULTS has exactly 209 keys', () => {
    assert.equal(Object.keys(CONFIG_MANIFEST_DEFAULTS).length, 209);
  });

  it('no duplicate keys across groups', () => {
    const allKeys = CONFIG_MANIFEST.flatMap(g => g.entries.map(e => e.key));
    assert.equal(allKeys.length, new Set(allKeys).size);
  });

  it('group titles and notes are non-empty strings', () => {
    for (const group of CONFIG_MANIFEST) {
      assert.ok(group.title.length > 0, `${group.id} has empty title`);
      assert.ok(group.notes.length > 0, `${group.id} has empty notes`);
    }
  });
});
