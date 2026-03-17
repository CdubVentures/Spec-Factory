import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSettingsManifest } from '../src/features/settings/api/settingsManifestBuilder.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../src/features/settings-authority/runtimeSettingsRoutePut.js';
import { CONVERGENCE_SETTINGS_ROUTE_PUT } from '../src/features/settings-authority/convergenceSettingsRouteContract.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

// ---------------------------------------------------------------------------
// Phase 17 — Settings manifest builder tests
// ---------------------------------------------------------------------------

test('manifest: buildSettingsManifest returns { runtime, convergence } sections', () => {
  const manifest = buildSettingsManifest();
  assert.ok(manifest.runtime, 'must have runtime section');
  assert.ok(manifest.convergence, 'must have convergence section');
});

test('manifest: runtime.intRange has entries with min, max, default for each intRangeMap key', () => {
  const manifest = buildSettingsManifest();
  const intRangeKeys = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap);
  assert.ok(intRangeKeys.length > 0, 'intRangeMap must not be empty');

  for (const key of intRangeKeys) {
    const entry = manifest.runtime.intRange[key];
    assert.ok(entry, `runtime.intRange must have ${key}`);
    assert.equal(typeof entry.min, 'number', `${key}.min must be number`);
    assert.equal(typeof entry.max, 'number', `${key}.max must be number`);
    assert.ok(entry.min <= entry.max, `${key}: min must be <= max`);
    // default may be null if no SETTINGS_DEFAULTS entry exists
  }
});

test('manifest: runtime.floatRange has entries with min, max for each floatRangeMap key', () => {
  const manifest = buildSettingsManifest();
  const floatRangeKeys = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap);
  assert.ok(floatRangeKeys.length > 0, 'floatRangeMap must not be empty');

  for (const key of floatRangeKeys) {
    const entry = manifest.runtime.floatRange[key];
    assert.ok(entry, `runtime.floatRange must have ${key}`);
    assert.equal(typeof entry.min, 'number', `${key}.min must be number`);
    assert.equal(typeof entry.max, 'number', `${key}.max must be number`);
  }
});

test('manifest: runtime.boolKeys lists all boolean config keys', () => {
  const manifest = buildSettingsManifest();
  const boolKeys = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap);
  assert.ok(Array.isArray(manifest.runtime.boolKeys));
  for (const key of boolKeys) {
    assert.ok(manifest.runtime.boolKeys.includes(key), `boolKeys must include ${key}`);
  }
});

test('manifest: runtime.stringEnum has allowed values for each stringEnumMap key', () => {
  const manifest = buildSettingsManifest();
  const enumKeys = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap);

  for (const key of enumKeys) {
    const entry = manifest.runtime.stringEnum[key];
    assert.ok(entry, `runtime.stringEnum must have ${key}`);
    assert.ok(Array.isArray(entry.allowed), `${key}.allowed must be array`);
    assert.ok(entry.allowed.length > 0, `${key}.allowed must not be empty`);
  }
});

test('manifest: convergence.keys lists all convergence int + float + bool keys', () => {
  const manifest = buildSettingsManifest();
  const allKeys = [
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys,
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys,
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys,
  ];
  assert.ok(Array.isArray(manifest.convergence.keys));
  for (const key of allKeys) {
    assert.ok(manifest.convergence.keys.includes(key), `convergence.keys must include ${key}`);
  }
});

test('manifest: convergence.defaults has values for all convergence keys', () => {
  const manifest = buildSettingsManifest();
  for (const key of manifest.convergence.keys) {
    assert.ok(
      manifest.convergence.defaults[key] !== undefined,
      `convergence.defaults must have ${key}`
    );
  }
});

test('manifest: intRange entries derive ranges from RUNTIME_SETTINGS_ROUTE_PUT', () => {
  const manifest = buildSettingsManifest();
  // Spot check a few keys
  const fetchConcurrency = manifest.runtime.intRange.fetchConcurrency;
  assert.ok(fetchConcurrency);
  assert.equal(fetchConcurrency.min, RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap.fetchConcurrency.min);
  assert.equal(fetchConcurrency.max, RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap.fetchConcurrency.max);
});

test('manifest: floatRange entries derive ranges from RUNTIME_SETTINGS_ROUTE_PUT', () => {
  const manifest = buildSettingsManifest();
  const ocrConf = manifest.runtime.floatRange.scannedPdfOcrMinConfidence;
  assert.ok(ocrConf);
  assert.equal(ocrConf.min, RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap.scannedPdfOcrMinConfidence.min);
  assert.equal(ocrConf.max, RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap.scannedPdfOcrMinConfidence.max);
});
