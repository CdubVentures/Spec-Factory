// WHY: Contract test for settingsAccessor — the single gateway for reading
// config values with registry-derived defaults. No hardcoded fallbacks anywhere.

import { describe, it } from 'node:test';
import { strictEqual, throws } from 'node:assert';
import { configValue, configInt, configFloat, configBool } from '../src/shared/settingsAccessor.js';

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
  });

  describe('configFloat', () => {
    it('returns float config value directly', () => {
      const config = { scannedPdfOcrMinConfidence: 0.75 };
      strictEqual(configFloat(config, 'scannedPdfOcrMinConfidence'), 0.75);
    });

    it('coerces string to float', () => {
      const config = { scannedPdfOcrMinConfidence: '0.75' };
      strictEqual(configFloat(config, 'scannedPdfOcrMinConfidence'), 0.75);
    });

    it('returns registry default when absent', () => {
      const config = {};
      strictEqual(configFloat(config, 'scannedPdfOcrMinConfidence'), 0.5);
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

    it('searchPlannerQueryCap default is 30 (was hardcoded as 120 in searchDiscovery)', () => {
      strictEqual(configInt({}, 'searchPlannerQueryCap'), 30);
    });

    it('maxUrlsPerProduct default is 50 (was hardcoded as 12 in pipelineCommands, 20 in configBuilder)', () => {
      strictEqual(configInt({}, 'maxUrlsPerProduct'), 50);
    });
  });
});
