import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDefaultsValid,
  SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS,
  CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS
} from '../../core/config/settingsClassification.js';
import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../../core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';

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

// ---------------------------------------------------------------------------
// Secret key exclusion — SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS must match
// every secret: true entry in the registry so canonical defaults never
// overwrite an explicitly-set API key with "".
// ---------------------------------------------------------------------------

test('defaultsValidation: SECRET set matches all secret: true registry entries', () => {
  const registrySecrets = RUNTIME_SETTINGS_REGISTRY
    .filter((e) => e.secret)
    .map((e) => e.key);

  assert.ok(registrySecrets.length >= 3, 'registry should have at least 3 secret keys');

  const missing = registrySecrets.filter((k) => !SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS.has(k));
  assert.deepStrictEqual(
    missing,
    [],
    `SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS is missing registry secrets: ${missing.join(', ')}`
  );

  const extra = [...SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS].filter(
    (k) => !registrySecrets.includes(k)
  );
  assert.deepStrictEqual(
    extra,
    [],
    `SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS has keys not in registry: ${extra.join(', ')}`
  );
});

test('defaultsValidation: no secret key appears in CANONICAL set', () => {
  const registrySecrets = RUNTIME_SETTINGS_REGISTRY
    .filter((e) => e.secret)
    .map((e) => e.key);

  const leaked = registrySecrets.filter((k) => CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS.has(k));
  assert.deepStrictEqual(
    leaked,
    [],
    `Secret keys leaked into CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS: ${leaked.join(', ')}`
  );
});

test('defaultsValidation: assertDefaultsValid catches wrong type', () => {
  const badDefaults = {
    ...SETTINGS_DEFAULTS,
    runtime: Object.freeze({
      ...SETTINGS_DEFAULTS.runtime,
      domainClassifierUrlCap: 'not-a-number' // intMap key with wrong type
    })
  };
  assert.throws(
    () => assertDefaultsValid(badDefaults),
    (err) => {
      assert.ok(err.message.includes('domainClassifierUrlCap'));
      return true;
    }
  );
});
