// WHY: Golden-master characterization tests locking down the CURRENT (pre-fix)
// behavior of the settings registry SSOT leak points. These tests verify the
// starting state before Phase 1-3 cleanup. They will be deleted in Phase 4.
import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';

import { RUNTIME_SETTINGS_REGISTRY, UI_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { SETTINGS_CLAMPING_INT_RANGE_MAP, SETTINGS_CLAMPING_FLOAT_RANGE_MAP, SETTINGS_CLAMPING_STRING_ENUM_MAP } from '../src/shared/settingsClampingRanges.js';
import { deriveRuntimeDefaults } from '../src/shared/settingsRegistryDerivations.js';
import { CUSTOM_KEYS } from '../src/core/config/configAssembly.js';
import { EXPLICIT_ENV_KEY_OVERRIDES } from '../src/core/config/settingsClassification.js';

describe('Settings Registry SSOT Leak — Pre-Fix Characterization', () => {
  // --- Issue 1: helperFilesRoot alias leak ---

  it('SETTINGS_DEFAULTS.runtime has helperFilesRoot key', () => {
    ok('helperFilesRoot' in SETTINGS_DEFAULTS.runtime, 'helperFilesRoot missing from runtime defaults');
    strictEqual(SETTINGS_DEFAULTS.runtime.helperFilesRoot, 'category_authority');
  });

  it('CUSTOM_KEYS contains helperFilesRoot', () => {
    ok(CUSTOM_KEYS.has('helperFilesRoot'), 'helperFilesRoot missing from CUSTOM_KEYS');
  });

  it('EXPLICIT_ENV_KEY_OVERRIDES has helperFilesRoot entry', () => {
    ok(EXPLICIT_ENV_KEY_OVERRIDES.has('helperFilesRoot'), 'helperFilesRoot missing from EXPLICIT_ENV_KEY_OVERRIDES');
  });

  it('helperFilesRoot exists as a separate deprecated registry entry', () => {
    const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'helperFilesRoot');
    ok(entry, 'helperFilesRoot entry missing from RUNTIME_SETTINGS_REGISTRY');
    strictEqual(entry.deprecated, true);
  });

  // --- Issue 2: runtimeAutoSaveEnabled dual-domain ---

  // Phase 2 completed: runtimeAutoSaveEnabled now only in UI registry
  it('runtimeAutoSaveEnabled only in UI registry (Phase 2 done)', () => {
    const runtimeEntry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'runtimeAutoSaveEnabled');
    const uiEntry = UI_SETTINGS_REGISTRY.find(e => e.key === 'runtimeAutoSaveEnabled');
    strictEqual(runtimeEntry, undefined, 'should NOT be in RUNTIME_SETTINGS_REGISTRY');
    ok(uiEntry, 'should be in UI_SETTINGS_REGISTRY');
  });

  it('runtimeAutoSaveEnabled only in SETTINGS_DEFAULTS.ui (Phase 2 done)', () => {
    ok(!('runtimeAutoSaveEnabled' in SETTINGS_DEFAULTS.runtime), 'should NOT be in runtime defaults');
    ok('runtimeAutoSaveEnabled' in SETTINGS_DEFAULTS.ui, 'should be in ui defaults');
  });

  // --- Issue 3: Legacy cfgKey field ---

  // Phase 1 completed: cfgKey → configKey unification
  it('no registry entries have cfgKey field (Phase 1 done)', () => {
    const withCfgKey = RUNTIME_SETTINGS_REGISTRY.filter(e => e.cfgKey);
    strictEqual(withCfgKey.length, 0, `entries still have cfgKey: ${withCfgKey.map(e => e.key).join(', ')}`);
  });

  it('clamping map entries use .configKey property name (Phase 1 done)', () => {
    strictEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.fetchConcurrency.configKey, 'concurrency');
    strictEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.resumeWindowHours.configKey, 'indexingResumeMaxAgeHours');
    strictEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.reextractAfterHours.configKey, 'indexingReextractAfterHours');
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.resumeMode.configKey, 'indexingResumeMode');
  });

  it('deriveRuntimeDefaults emits dual keys for cfgKey-aliased entries', () => {
    const derived = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);
    // fetchConcurrency (key) and concurrency (cfgKey) should both exist
    strictEqual(derived.fetchConcurrency, derived.concurrency, 'fetchConcurrency !== concurrency');
    strictEqual(derived.resumeMode, derived.indexingResumeMode, 'resumeMode !== indexingResumeMode');
    strictEqual(derived.resumeWindowHours, derived.indexingResumeMaxAgeHours, 'resumeWindowHours !== indexingResumeMaxAgeHours');
    strictEqual(derived.reextractAfterHours, derived.indexingReextractAfterHours, 'reextractAfterHours !== indexingReextractAfterHours');
    strictEqual(derived.reextractIndexed, derived.indexingReextractEnabled, 'reextractIndexed !== indexingReextractEnabled');
  });
});
