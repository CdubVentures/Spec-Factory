// WHY: Contract tests for Phase 1 — cfgKey → configKey unification.
// These tests define the target state: no entry has cfgKey, clamping maps
// use .configKey, and dual-key emission still works via configKey field.
import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';

import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';
import { SETTINGS_CLAMPING_INT_RANGE_MAP, SETTINGS_CLAMPING_FLOAT_RANGE_MAP, SETTINGS_CLAMPING_STRING_ENUM_MAP } from '../src/shared/settingsClampingRanges.js';
import { deriveRuntimeDefaults } from '../src/shared/settingsRegistryDerivations.js';

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

  it('deriveRuntimeDefaults still emits dual keys for key≠configKey entries', () => {
    const derived = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);
    strictEqual(derived.resumeMode, derived.indexingResumeMode, 'resumeMode !== indexingResumeMode');
    strictEqual(derived.resumeWindowHours, derived.indexingResumeMaxAgeHours);
  });
});
