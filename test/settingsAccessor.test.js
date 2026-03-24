// WHY: Contract test for settingsAccessor — the single gateway for reading
// config values with registry-derived defaults. No hardcoded fallbacks anywhere.

import { describe, it } from 'node:test';
import { strictEqual, throws } from 'node:assert';
import { configValue, configInt, configFloat, configBool } from '../src/shared/settingsAccessor.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';

// WHY: All expected values are derived from the registry at runtime.
// Zero hardcoded numbers — if someone changes a registry default/min/max,
// these tests automatically pick it up.
function registryEntry(key) {
  const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
  if (!entry) throw new Error(`Test setup: no registry entry for "${key}"`);
  return entry;
}

describe('settingsAccessor', () => {

  describe('configValue', () => {
    it('returns config value when key exists in config', () => {
      const config = { searchProfileQueryCap: 42 };
      strictEqual(configValue(config, 'searchProfileQueryCap'), 42);
    });

    it('returns registry default when key is absent from config', () => {
      const config = {};
      // Registry default for searchProfileQueryCap is 10
      strictEqual(configValue(config, 'searchProfileQueryCap'), 10);
    });

    it('returns registry default when config value is undefined', () => {
      const config = { searchProfileQueryCap: undefined };
      strictEqual(configValue(config, 'searchProfileQueryCap'), 10);
    });

    it('returns registry default when config value is null', () => {
      const config = { searchProfileQueryCap: null };
      strictEqual(configValue(config, 'searchProfileQueryCap'), 10);
    });

    it('preserves falsy config values that are not null/undefined', () => {
      const config = { discoveryEnabled: false };
      strictEqual(configValue(config, 'discoveryEnabled'), false);
    });

    it('preserves zero as a valid config value', () => {
      const config = { domainRequestRps: 0 };
      strictEqual(configValue(config, 'domainRequestRps'), 0);
    });

    it('preserves empty string as a valid config value', () => {
      const config = { searxngBaseUrl: '' };
      strictEqual(configValue(config, 'searxngBaseUrl'), '');
    });

    it('throws for unknown key not in registry', () => {
      const config = {};
      throws(
        () => configValue(config, 'totallyFakeSettingKey'),
        { message: /unknown setting.*totallyFakeSettingKey/i }
      );
    });

    it('looks up by configKey when configKey differs from key', () => {
      // Registry: key=fetchConcurrency, configKey=concurrency
      // The config object uses configKey names, so configValue should
      // accept the registry key and find the default
      const config = {};
      const result = configValue(config, 'fetchConcurrency');
      strictEqual(result, 4); // registry default for fetchConcurrency
    });
  });

  describe('configInt', () => {
    it('returns numeric config value directly', () => {
      const config = { searchProfileQueryCap: 42 };
      strictEqual(configInt(config, 'searchProfileQueryCap'), 42);
    });

    it('coerces string config value to number', () => {
      const config = { searchProfileQueryCap: '42' };
      strictEqual(configInt(config, 'searchProfileQueryCap'), 42);
    });

    it('returns registry default as number when key absent', () => {
      const config = {};
      strictEqual(configInt(config, 'searchProfileQueryCap'), 10);
    });

    it('throws for unknown key', () => {
      throws(
        () => configInt({}, 'notARealSetting'),
        { message: /unknown setting/i }
      );
    });

    it('returns registry default when value is non-numeric string (NaN)', () => {
      const entry = registryEntry('searchProfileQueryCap');
      strictEqual(configInt({ searchProfileQueryCap: 'abc' }, 'searchProfileQueryCap'), entry.default);
    });

    it('returns registry default when value is an object (NaN)', () => {
      const entry = registryEntry('searchProfileQueryCap');
      strictEqual(configInt({ searchProfileQueryCap: {} }, 'searchProfileQueryCap'), entry.default);
    });

    it('clamps to registry min when value is below floor', () => {
      const entry = registryEntry('searchProfileQueryCap');
      strictEqual(configInt({ searchProfileQueryCap: -5 }, 'searchProfileQueryCap'), entry.min);
    });

    it('clamps to registry max when value is above ceiling', () => {
      const entry = registryEntry('searchProfileQueryCap');
      strictEqual(configInt({ searchProfileQueryCap: 9999 }, 'searchProfileQueryCap'), entry.max);
    });

    it('preserves value at exact min boundary', () => {
      const entry = registryEntry('searchProfileQueryCap');
      strictEqual(configInt({ searchProfileQueryCap: entry.min }, 'searchProfileQueryCap'), entry.min);
    });

    it('preserves value at exact max boundary', () => {
      const entry = registryEntry('searchProfileQueryCap');
      strictEqual(configInt({ searchProfileQueryCap: entry.max }, 'searchProfileQueryCap'), entry.max);
    });

    it('preserves zero when zero is within registry min/max', () => {
      const entry = registryEntry('domainRequestRps');
      strictEqual(entry.min, 0); // sanity: registry declares min=0
      strictEqual(configInt({ domainRequestRps: 0 }, 'domainRequestRps'), 0);
    });
  });

  describe('configFloat', () => {
    it('returns float config value directly', () => {
      const config = { llmCostInputPer1M: 0.75 };
      strictEqual(configFloat(config, 'llmCostInputPer1M'), 0.75);
    });

    it('coerces string to float', () => {
      const config = { llmCostInputPer1M: '0.75' };
      strictEqual(configFloat(config, 'llmCostInputPer1M'), 0.75);
    });

    it('returns registry default when absent', () => {
      const config = {};
      strictEqual(configFloat(config, 'llmCostInputPer1M'), 1.25);
    });

    it('returns registry default when value is non-numeric string (NaN)', () => {
      const entry = registryEntry('llmCostInputPer1M');
      strictEqual(configFloat({ llmCostInputPer1M: 'xyz' }, 'llmCostInputPer1M'), entry.default);
    });

    it('clamps to registry max when value exceeds ceiling', () => {
      const entry = registryEntry('llmCostInputPer1M');
      strictEqual(configFloat({ llmCostInputPer1M: 5000.0 }, 'llmCostInputPer1M'), entry.max);
    });

    it('clamps to registry min when value is below floor', () => {
      const entry = registryEntry('llmCostInputPer1M');
      strictEqual(configFloat({ llmCostInputPer1M: -0.5 }, 'llmCostInputPer1M'), entry.min);
    });

    it('preserves value at exact min boundary', () => {
      const entry = registryEntry('llmCostInputPer1M');
      strictEqual(configFloat({ llmCostInputPer1M: entry.min }, 'llmCostInputPer1M'), entry.min);
    });

    it('preserves value at exact max boundary', () => {
      const entry = registryEntry('llmCostInputPer1M');
      strictEqual(configFloat({ llmCostInputPer1M: entry.max }, 'llmCostInputPer1M'), entry.max);
    });
  });

  describe('configBool', () => {
    it('returns boolean config value directly', () => {
      const config = { discoveryEnabled: false };
      strictEqual(configBool(config, 'discoveryEnabled'), false);
    });

    it('returns registry default when absent', () => {
      const config = {};
      strictEqual(configBool(config, 'discoveryEnabled'), true);
    });

    it('coerces truthy/falsy values', () => {
      strictEqual(configBool({ autoScrollEnabled: 1 }, 'autoScrollEnabled'), true);
      strictEqual(configBool({ autoScrollEnabled: 0 }, 'autoScrollEnabled'), false);
    });
  });

  describe('drift-bug regression guards', () => {
    // These verify the exact registry defaults for settings that had
    // hardcoded fallback drift bugs. If someone changes the registry
    // default, these tests surface it explicitly.

    it('searchProfileQueryCap default is 10 (was hardcoded as 6, 8, 12 in various files)', () => {
      strictEqual(configInt({}, 'searchProfileQueryCap'), 10);
    });

    it('maxUrlsPerProduct default is 50 (was hardcoded as 12 in pipelineCommands, 20 in configBuilder)', () => {
      strictEqual(configInt({}, 'maxUrlsPerProduct'), 50);
    });
  });
});
