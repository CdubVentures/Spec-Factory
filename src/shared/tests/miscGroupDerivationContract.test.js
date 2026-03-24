// WHY: Contract test for deriving miscGroup manifest entries from registry SSOT.
// After Phase 2, miscGroup.js will call deriveMiscGroupEntries() instead of
// maintaining 81 hand-written entries. This test ensures the derivation
// produces output that matches the manifest consumer contract.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { deriveMiscGroupEntries } from '../settingsRegistryDerivations.js';

describe('deriveMiscGroupEntries', () => {

  const entries = deriveMiscGroupEntries(RUNTIME_SETTINGS_REGISTRY);

  it('produces a non-empty frozen array', () => {
    ok(Array.isArray(entries), 'entries must be an array');
    ok(entries.length > 0, 'entries must not be empty');
    ok(Object.isFrozen(entries), 'entries must be frozen');
  });

  it('every entry has the required manifest shape', () => {
    for (const entry of entries) {
      ok(typeof entry.key === 'string' && entry.key.length > 0,
        `entry.key must be a non-empty string, got: ${entry.key}`);
      ok(typeof entry.defaultValue === 'string',
        `entry.defaultValue must be a string for ${entry.key}, got: ${typeof entry.defaultValue}`);
      ok(['string', 'integer', 'number', 'boolean', 'json'].includes(entry.type),
        `entry.type must be a valid manifest type for ${entry.key}, got: ${entry.type}`);
      ok(typeof entry.secret === 'boolean',
        `entry.secret must be a boolean for ${entry.key}`);
      ok(typeof entry.userMutable === 'boolean',
        `entry.userMutable must be a boolean for ${entry.key}`);
      ok(typeof entry.description === 'string' && entry.description.length > 0,
        `entry.description must be a non-empty string for ${entry.key}`);
    }
  });

  it('keys are UPPER_SNAKE_CASE (matching envKey convention)', () => {
    for (const entry of entries) {
      ok(
        /^[A-Z][A-Z0-9_]*$/.test(entry.key),
        `key must be UPPER_SNAKE_CASE: ${entry.key}`
      );
    }
  });

  it('no duplicate keys', () => {
    const keys = entries.map(e => e.key);
    const unique = new Set(keys);
    strictEqual(unique.size, keys.length, 'duplicate manifest keys detected');
  });

  it('type mapping: registry int -> manifest "integer"', () => {
    const intEntries = RUNTIME_SETTINGS_REGISTRY.filter(e =>
      e.type === 'int' && e.envKey && !e.routeOnly
    );
    for (const reg of intEntries) {
      const manifest = entries.find(e => e.key === reg.envKey);
      if (manifest) {
        strictEqual(manifest.type, 'integer',
          `${reg.key} -> ${reg.envKey} should be "integer", got: ${manifest.type}`);
      }
    }
  });

  it('type mapping: registry float -> manifest "number"', () => {
    const floatEntries = RUNTIME_SETTINGS_REGISTRY.filter(e =>
      e.type === 'float' && e.envKey && !e.routeOnly
    );
    for (const reg of floatEntries) {
      const manifest = entries.find(e => e.key === reg.envKey);
      if (manifest) {
        strictEqual(manifest.type, 'number',
          `${reg.key} -> ${reg.envKey} should be "number", got: ${manifest.type}`);
      }
    }
  });

  it('type mapping: registry bool -> manifest "boolean"', () => {
    const boolEntries = RUNTIME_SETTINGS_REGISTRY.filter(e =>
      e.type === 'bool' && e.envKey && !e.routeOnly
    );
    for (const reg of boolEntries) {
      const manifest = entries.find(e => e.key === reg.envKey);
      if (manifest) {
        strictEqual(manifest.type, 'boolean',
          `${reg.key} -> ${reg.envKey} should be "boolean", got: ${manifest.type}`);
      }
    }
  });

  it('defaultValues are stringified registry defaults', () => {
    const spot = [
      // WHY: CONCURRENCY removed — fetchConcurrency retired from registry.
      { envKey: 'MAX_RUN_SECONDS', expectedDefault: '480' },
      { envKey: 'GOOGLE_SEARCH_TIMEOUT_MS', expectedDefault: '30000' },
      { envKey: 'DISCOVERY_ENABLED', expectedDefault: 'true' },
      { envKey: 'SEARCH_PROFILE_QUERY_CAP', expectedDefault: '10' },
    ];
    for (const { envKey, expectedDefault } of spot) {
      const entry = entries.find(e => e.key === envKey);
      ok(entry, `expected manifest entry for ${envKey}`);
      strictEqual(entry.defaultValue, expectedDefault,
        `${envKey} defaultValue should be ${expectedDefault}, got: ${entry.defaultValue}`);
    }
  });

  it('secret entries are marked secret', () => {
    const secretRegistry = RUNTIME_SETTINGS_REGISTRY.filter(e => e.secret && e.envKey);
    for (const reg of secretRegistry) {
      const manifest = entries.find(e => e.key === reg.envKey);
      if (manifest) {
        strictEqual(manifest.secret, true,
          `${reg.envKey} should be secret`);
      }
    }
  });

  it('all entries have userMutable=false', () => {
    for (const entry of entries) {
      strictEqual(entry.userMutable, false,
        `${entry.key} should have userMutable=false`);
    }
  });

  it('entries with empty envKey are excluded', () => {
    const emptyEnvKeys = RUNTIME_SETTINGS_REGISTRY.filter(e => !e.envKey);
    for (const reg of emptyEnvKeys) {
      const found = entries.find(e => e.key === reg.key);
      ok(!found, `entry with empty envKey should not appear: ${reg.key}`);
    }
  });
});
