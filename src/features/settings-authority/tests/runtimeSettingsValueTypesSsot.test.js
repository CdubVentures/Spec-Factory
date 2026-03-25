import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_SETTINGS_REGISTRY } from '../../../shared/settingsRegistry.js';
import { deriveValueTypeMap } from '../../../shared/settingsRegistryDerivations.js';
import { RUNTIME_SETTINGS_VALUE_TYPES } from '../runtimeSettingsValueTypes.js';

// WHY: Verifies that RUNTIME_SETTINGS_VALUE_TYPES is derived from the registry
// SSOT via deriveValueTypeMap(), not reverse-engineered from the PUT contract.

const sorted = (arr) => [...arr].sort();

// Build the expected map: deriveValueTypeMap minus defaultsOnly entries
const defaultsOnlyCfgKeys = new Set(
  RUNTIME_SETTINGS_REGISTRY
    .filter((e) => e.defaultsOnly)
    .map((e) => e.configKey || e.key)
);
const fullDerived = deriveValueTypeMap(RUNTIME_SETTINGS_REGISTRY);
const expectedKeys = Object.keys(fullDerived).filter((k) => !defaultsOnlyCfgKeys.has(k));

test('valueTypes SSOT: key set matches registry-derived map (minus defaultsOnly)', () => {
  const actual = sorted(Object.keys(RUNTIME_SETTINGS_VALUE_TYPES));
  const expected = sorted(expectedKeys);
  assert.deepStrictEqual(actual, expected,
    'RUNTIME_SETTINGS_VALUE_TYPES keys should equal deriveValueTypeMap(registry) minus defaultsOnly');
});

test('valueTypes SSOT: storage-owned keys do not leak into the runtime value-type map', () => {
  // awsRegion and s3Bucket now belong to the storage settings surface, not runtime.
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.awsRegion, undefined);
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.s3Bucket, undefined);
});

test('valueTypes SSOT: retired entries are excluded', () => {
  // discoveryEnabled, dryRun removed from registry — must not appear.
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.discoveryEnabled, undefined,
    'retired entries must not appear in RUNTIME_SETTINGS_VALUE_TYPES');
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.dryRun, undefined,
    'retired entries must not appear in RUNTIME_SETTINGS_VALUE_TYPES');
});

test('valueTypes SSOT: type tokens match registry entry types', () => {
  const cases = [
    ['autoScrollDelayMs', 'integer'],
    ['llmCostInputPer1M', 'number'],
    ['autoScrollEnabled', 'boolean'],
    ['searchEngines', 'string'],
    ['llmProvider', 'string'],
  ];
  for (const [key, expectedType] of cases) {
    assert.equal(RUNTIME_SETTINGS_VALUE_TYPES[key], expectedType,
      `${key} should be '${expectedType}'`);
  }
});
