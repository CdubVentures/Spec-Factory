// WHY: Contract tests for Phase 1 — cfgKey → configKey unification.
// These tests define the target state: no entry has cfgKey, clamping maps
// use .configKey, and dual-key emission still works via configKey field.
import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';

import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { SETTINGS_CLAMPING_INT_RANGE_MAP, SETTINGS_CLAMPING_FLOAT_RANGE_MAP, SETTINGS_CLAMPING_STRING_ENUM_MAP } from '../settingsClampingRanges.js';
import { deriveRuntimeDefaults } from '../settingsRegistryDerivations.js';

describe('cfgKey → configKey Unification Contract', () => {
  it('no RUNTIME_SETTINGS_REGISTRY entry has a cfgKey property', () => {
    const withCfgKey = RUNTIME_SETTINGS_REGISTRY.filter(e => e.cfgKey != null);
    strictEqual(withCfgKey.length, 0, `entries still have cfgKey: ${withCfgKey.map(e => e.key).join(', ')}`);
  });

  it('int clamping map descriptors use .configKey not .cfgKey', () => {
    for (const [feKey, desc] of Object.entries(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      ok('configKey' in desc, `${feKey} missing .configKey`);
      ok(!('cfgKey' in desc), `${feKey} still has .cfgKey`);
    }
  });

  it('float clamping map descriptors use .configKey not .cfgKey', () => {
    for (const [feKey, desc] of Object.entries(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      ok('configKey' in desc, `${feKey} missing .configKey`);
      ok(!('cfgKey' in desc), `${feKey} still has .cfgKey`);
    }
  });

  it('string enum map descriptors use .configKey not .cfgKey', () => {
    for (const [feKey, desc] of Object.entries(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      ok('configKey' in desc, `${feKey} missing .configKey`);
      ok(!('cfgKey' in desc), `${feKey} still has .cfgKey`);
    }
  });

  it('retired resume dual keys are no longer emitted', () => {
    const derived = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);
    ok(!('resumeMode' in derived), 'retired resumeMode should not be in derived defaults');
    ok(!('indexingResumeMode' in derived), 'retired indexingResumeMode should not be in derived defaults');
    ok(!('resumeWindowHours' in derived), 'retired resumeWindowHours should not be in derived defaults');
    ok(!('indexingResumeMaxAgeHours' in derived), 'retired indexingResumeMaxAgeHours should not be in derived defaults');
  });
});
