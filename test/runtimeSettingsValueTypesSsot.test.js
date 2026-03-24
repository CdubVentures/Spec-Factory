import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';
import { deriveValueTypeMap } from '../src/shared/settingsRegistryDerivations.js';
import { RUNTIME_SETTINGS_VALUE_TYPES } from '../src/features/settings-authority/runtimeSettingsValueTypes.js';

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

test('valueTypes SSOT: readOnly entries are included without hardcoding', () => {
  // awsRegion and s3Bucket are readOnly: true — must appear naturally from the registry
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.awsRegion, 'string');
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.s3Bucket, 'string');
});

test('valueTypes SSOT: defaultsOnly entries are excluded', () => {
  // discoveryEnabled has defaultsOnly: true — must NOT appear
  assert.equal(RUNTIME_SETTINGS_VALUE_TYPES.discoveryEnabled, undefined,
    'defaultsOnly entries must not appear in RUNTIME_SETTINGS_VALUE_TYPES');
});

test('valueTypes SSOT: type tokens match registry entry types', () => {
  const cases = [
    ['autoScrollDelayMs', 'integer'],
    ['llmCostInputPer1M', 'number'],
    ['dryRun', 'boolean'],
    ['searchEngines', 'string'],
    ['llmProvider', 'string'],
  ];
  for (const [key, expectedType] of cases) {
    assert.equal(RUNTIME_SETTINGS_VALUE_TYPES[key], expectedType,
      `${key} should be '${expectedType}'`);
  }
});
