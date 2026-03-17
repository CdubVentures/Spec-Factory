import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDefaultsValid } from '../src/core/config/settingsClassification.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { RUNTIME_SETTINGS_ROUTE_GET, CONVERGENCE_SETTINGS_KEYS } from '../src/core/config/settingsKeyMap.js';

// ---------------------------------------------------------------------------
// Phase 10 — Tests for defaults validation
//
// Verifies that SETTINGS_DEFAULTS pass type/range validation against the
// route contracts (RUNTIME_SETTINGS_ROUTE_GET type maps).
// ---------------------------------------------------------------------------

test('defaultsValidation: assertDefaultsValid does not throw for current defaults', () => {
  // Should not throw — current defaults should be valid
  assertDefaultsValid(SETTINGS_DEFAULTS);
});

test('defaultsValidation: all runtime int keys have numeric defaults', () => {
  const intKeys = Object.values(RUNTIME_SETTINGS_ROUTE_GET.intMap);
  const runtime = SETTINGS_DEFAULTS.runtime;
  for (const configKey of intKeys) {
    // The setting key might map to a different config key
    // Check if the key exists in runtime defaults (it may not — some come from env only)
    const settingEntries = Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap);
    for (const [settingKey, cKey] of settingEntries) {
      if (cKey !== configKey) continue;
      if (!Object.hasOwn(runtime, settingKey)) continue;
      const val = runtime[settingKey];
      assert.equal(typeof val, 'number', `runtime.${settingKey} should be a number but got ${typeof val}`);
      assert.ok(Number.isFinite(val), `runtime.${settingKey} should be finite`);
    }
  }
});

test('defaultsValidation: all runtime float keys have numeric defaults', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    assert.equal(typeof val, 'number', `runtime.${settingKey} should be a number but got ${typeof val}`);
    assert.ok(Number.isFinite(val), `runtime.${settingKey} should be finite`);
  }
});

test('defaultsValidation: all runtime bool keys have boolean defaults', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    assert.equal(typeof val, 'boolean', `runtime.${settingKey} should be a boolean but got ${typeof val}`);
  }
});

test('defaultsValidation: all runtime string keys have string defaults', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    assert.equal(typeof val, 'string', `runtime.${settingKey} should be a string but got ${typeof val}`);
  }
});

test('defaultsValidation: all convergence keys exist in convergence defaults', () => {
  const convergence = SETTINGS_DEFAULTS.convergence;
  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    assert.ok(Object.hasOwn(convergence, key), `convergence.${key} must have a default`);
  }
});

test('defaultsValidation: assertDefaultsValid catches wrong type', () => {
  const badDefaults = {
    ...SETTINGS_DEFAULTS,
    runtime: Object.freeze({
      ...SETTINGS_DEFAULTS.runtime,
      maxUrlsPerProduct: 'not-a-number' // intMap key with wrong type
    })
  };
  assert.throws(
    () => assertDefaultsValid(badDefaults),
    (err) => {
      assert.ok(err.message.includes('maxUrlsPerProduct'));
      return true;
    }
  );
});
