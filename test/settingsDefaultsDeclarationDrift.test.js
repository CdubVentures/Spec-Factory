// WHY: Characterization test locking down the ACTUAL shape of SETTINGS_DEFAULTS
// and SETTINGS_OPTION_VALUES vs the stale .d.ts that declared searchProvider
// and automationQueueStorageEngine. This test proves the .d.ts is dead code
// and can be safely deleted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES, SEARXNG_AVAILABLE_ENGINES } from '../src/shared/settingsDefaults.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';

describe('settingsDefaults declaration drift characterization', () => {
  describe('SETTINGS_DEFAULTS.runtime contains all non-routeOnly registry keys', () => {
    const runtimeKeys = Object.keys(SETTINGS_DEFAULTS.runtime);
    const nonRouteOnlyEntries = RUNTIME_SETTINGS_REGISTRY.filter(e => !e.routeOnly);

    it('every non-routeOnly registry entry has a key in runtime defaults', () => {
      for (const entry of nonRouteOnlyEntries) {
        const cfgKey = entry.cfgKey || entry.key;
        assert.ok(
          runtimeKeys.includes(cfgKey),
          `Missing runtime default for registry entry: ${entry.key} (cfgKey: ${cfgKey})`,
        );
      }
    });

    it('aliased entries appear under both key and cfgKey', () => {
      const aliased = nonRouteOnlyEntries.filter(e => e.cfgKey && e.cfgKey !== e.key);
      for (const entry of aliased) {
        assert.ok(
          runtimeKeys.includes(entry.key),
          `Missing alias key ${entry.key} for cfgKey ${entry.cfgKey}`,
        );
        assert.ok(
          runtimeKeys.includes(entry.cfgKey),
          `Missing cfgKey ${entry.cfgKey} for key ${entry.key}`,
        );
      }
    });
  });

  describe('no orphan keys from stale .d.ts', () => {
    it('automationQueueStorageEngine is NOT in runtime defaults', () => {
      assert.equal(
        Object.hasOwn(SETTINGS_DEFAULTS.runtime, 'automationQueueStorageEngine'),
        false,
        'automationQueueStorageEngine should not exist — it was declared in the stale .d.ts but never in the registry',
      );
    });

    it('automationQueueStorageEngine is NOT in any registry entry', () => {
      const found = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'automationQueueStorageEngine');
      assert.equal(found, undefined, 'automationQueueStorageEngine must not exist in the registry');
    });
  });

  describe('searchEngines vs searchProvider alias handling', () => {
    it('searchEngines is the canonical registry key', () => {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'searchEngines');
      assert.ok(entry, 'searchEngines must exist in the registry');
      assert.equal(entry.type, 'csv_enum');
    });

    it('searchProvider is only an alias, not a top-level registry key', () => {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'searchProvider');
      assert.equal(entry, undefined, 'searchProvider must NOT be a top-level registry key');

      const searchEnginesEntry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'searchEngines');
      assert.ok(
        searchEnginesEntry.aliases && searchEnginesEntry.aliases.includes('searchProvider'),
        'searchProvider should appear as an alias on the searchEngines entry',
      );
    });
  });

  describe('SETTINGS_OPTION_VALUES.runtime matches registry allowed[] arrays', () => {
    it('has keys for every enum/csv_enum registry entry with allowed', () => {
      const enumEntries = RUNTIME_SETTINGS_REGISTRY.filter(
        e => (e.type === 'enum' || e.type === 'csv_enum') && e.allowed,
      );
      for (const entry of enumEntries) {
        assert.ok(
          Object.hasOwn(SETTINGS_OPTION_VALUES.runtime, entry.key),
          `Missing option values for ${entry.key}`,
        );
      }
    });

    it('searchEngines options equal SEARXNG_AVAILABLE_ENGINES (not stale .d.ts values)', () => {
      assert.deepStrictEqual(
        SETTINGS_OPTION_VALUES.runtime.searchEngines,
        SEARXNG_AVAILABLE_ENGINES,
        'searchEngines options must match the canonical SEARXNG_AVAILABLE_ENGINES, ' +
        'not the stale .d.ts values [none, google, bing, searxng, dual]',
      );
    });
  });
});
