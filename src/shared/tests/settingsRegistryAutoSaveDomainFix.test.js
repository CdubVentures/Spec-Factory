// WHY: Contract tests for Phase 2 — runtimeAutoSaveEnabled should live in
// exactly one registry (UI_SETTINGS_REGISTRY), not both RUNTIME and UI.
import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';

import { RUNTIME_SETTINGS_REGISTRY, UI_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';

describe('runtimeAutoSaveEnabled Single-Domain Contract', () => {
  it('runtimeAutoSaveEnabled NOT in RUNTIME_SETTINGS_REGISTRY', () => {
    const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === 'runtimeAutoSaveEnabled');
    strictEqual(entry, undefined, 'runtimeAutoSaveEnabled should NOT be in RUNTIME_SETTINGS_REGISTRY');
  });

  it('runtimeAutoSaveEnabled NOT in SETTINGS_DEFAULTS.runtime', () => {
    ok(!('runtimeAutoSaveEnabled' in SETTINGS_DEFAULTS.runtime), 'should not be in runtime defaults');
  });

  it('runtimeAutoSaveEnabled IS in UI_SETTINGS_REGISTRY', () => {
    const entry = UI_SETTINGS_REGISTRY.find(e => e.key === 'runtimeAutoSaveEnabled');
    ok(entry, 'runtimeAutoSaveEnabled should be in UI_SETTINGS_REGISTRY');
    strictEqual(entry.mutable, true);
  });

  it('runtimeAutoSaveEnabled IS in SETTINGS_DEFAULTS.ui', () => {
    ok('runtimeAutoSaveEnabled' in SETTINGS_DEFAULTS.ui, 'should be in ui defaults');
    strictEqual(SETTINGS_DEFAULTS.ui.runtimeAutoSaveEnabled, true);
  });
});
