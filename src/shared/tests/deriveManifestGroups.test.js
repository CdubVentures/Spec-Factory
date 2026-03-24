import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveManifestGroups } from '../settingsRegistryDerivations.js';

const GROUP_META = [
  { id: 'alpha', title: 'Alpha Group', notes: 'First group.' },
  { id: 'beta', title: 'Beta Group', notes: 'Second group.' },
  { id: 'misc', title: 'Miscellaneous', notes: 'Catch-all.' },
];

describe('deriveManifestGroups', () => {
  it('produces groups with correct structure', () => {
    const registry = [
      { key: 'foo', envKey: 'FOO', type: 'string', default: 'bar', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'alpha');
    assert.equal(result[0].title, 'Alpha Group');
    assert.equal(result[0].notes, 'First group.');
    assert.ok(Array.isArray(result[0].entries));
  });

  it('each entry has { key, defaultValue, type, secret, userMutable, description }', () => {
    const registry = [
      { key: 'x', envKey: 'X_VAR', type: 'int', default: 42, group: 'alpha', secret: true },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    const entry = result[0].entries[0];
    assert.equal(entry.key, 'X_VAR');
    assert.equal(entry.defaultValue, '42');
    assert.equal(entry.type, 'integer');
    assert.equal(entry.secret, true);
    assert.equal(entry.userMutable, false);
    assert.equal(typeof entry.description, 'string');
  });

  it('maps registry types to manifest types', () => {
    const cases = [
      { regType: 'int', expected: 'integer' },
      { regType: 'float', expected: 'number' },
      { regType: 'bool', expected: 'boolean' },
      { regType: 'string', expected: 'string' },
      { regType: 'enum', expected: 'string' },
      { regType: 'csv_enum', expected: 'string' },
    ];
    for (const { regType, expected } of cases) {
      const registry = [{ key: 'k', envKey: 'K', type: regType, default: '', group: 'alpha' }];
      const result = deriveManifestGroups(registry, GROUP_META);
      assert.equal(result[0].entries[0].type, expected, `${regType} should map to ${expected}`);
    }
  });

  it('assigns entries to correct groups via entry.group', () => {
    const registry = [
      { key: 'a', envKey: 'A', type: 'string', default: '', group: 'alpha' },
      { key: 'b', envKey: 'B', type: 'string', default: '', group: 'beta' },
      { key: 'c', envKey: 'C', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    const alpha = result.find(g => g.id === 'alpha');
    const beta = result.find(g => g.id === 'beta');
    assert.equal(alpha.entries.length, 2);
    assert.equal(beta.entries.length, 1);
  });

  it('entries without group default to misc', () => {
    const registry = [
      { key: 'orphan', envKey: 'ORPHAN', type: 'string', default: 'val' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    const misc = result.find(g => g.id === 'misc');
    assert.ok(misc);
    assert.equal(misc.entries[0].key, 'ORPHAN');
  });

  it('excludes entries without envKey', () => {
    const registry = [
      { key: 'noEnv', type: 'string', default: '', group: 'alpha' },
      { key: 'hasEnv', envKey: 'HAS', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.equal(result[0].entries.length, 1);
    assert.equal(result[0].entries[0].key, 'HAS');
  });

  it('excludes entries with routeOnly flag', () => {
    const registry = [
      { key: 'r', envKey: 'R', type: 'string', default: '', group: 'alpha', routeOnly: true },
      { key: 's', envKey: 'S', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.equal(result[0].entries.length, 1);
    assert.equal(result[0].entries[0].key, 'S');
  });

  it('propagates secret flag (defaults to false)', () => {
    const registry = [
      { key: 'a', envKey: 'A', type: 'string', default: '', group: 'alpha', secret: true },
      { key: 'b', envKey: 'B', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.equal(result[0].entries[0].secret, true);
    assert.equal(result[0].entries[1].secret, false);
  });

  it('defaultValue is String(entry.default ?? "")', () => {
    const cases = [
      { input: 42, expected: '42' },
      { input: true, expected: 'true' },
      { input: 0, expected: '0' },
      { input: '', expected: '' },
      { input: null, expected: '' },
      { input: undefined, expected: '' },
      { input: 'hello', expected: 'hello' },
    ];
    for (const { input, expected } of cases) {
      const registry = [{ key: 'k', envKey: 'K', type: 'string', default: input, group: 'alpha' }];
      const result = deriveManifestGroups(registry, GROUP_META);
      assert.equal(result[0].entries[0].defaultValue, expected, `default ${JSON.stringify(input)} → "${expected}"`);
    }
  });

  it('omits empty groups from output', () => {
    const registry = [
      { key: 'a', envKey: 'A', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'alpha');
  });

  it('preserves group ordering from groupMeta', () => {
    const registry = [
      { key: 'b', envKey: 'B', type: 'string', default: '', group: 'beta' },
      { key: 'a', envKey: 'A', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.equal(result[0].id, 'alpha');
    assert.equal(result[1].id, 'beta');
  });

  it('result and entries are frozen', () => {
    const registry = [
      { key: 'a', envKey: 'A', type: 'string', default: '', group: 'alpha' },
    ];
    const result = deriveManifestGroups(registry, GROUP_META);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result[0]));
    assert.ok(Object.isFrozen(result[0].entries));
    assert.ok(Object.isFrozen(result[0].entries[0]));
  });
});
