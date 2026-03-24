import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const IDENTITY_GATE_PATH = path.resolve('src/features/indexing/validation/identityGate.js');
const SETTINGS_DEFAULTS_PATH = path.resolve('src/shared/settingsDefaults.js');
const NEEDSET_ENGINE_PATH = path.resolve('src/indexlab/needsetEngine.js');

test('evaluateSourceIdentity uses identityGateBaseMatchThreshold directly (no dynamic adjustment)', async () => {
  const mod = await import(pathToFileURL(IDENTITY_GATE_PATH).href);
  const { evaluateSourceIdentity } = mod;

  const source = {
    url: 'https://example.com/acme-orbit-x1',
    title: 'Acme Orbit X1',
    identityCandidates: { brand: 'Acme', model: 'Orbit X1' },
  };
  const identityLock = { brand: 'Acme', model: 'Orbit X1' };

  // With base threshold 0.5 — should match easily
  const resultLow = evaluateSourceIdentity(source, identityLock, { identityGateBaseMatchThreshold: 0.5 });
  assert.equal(resultLow.matchThreshold, 0.5, 'matchThreshold should equal base threshold directly');

  // With base threshold 0.99 — should use that exact value
  const resultHigh = evaluateSourceIdentity(source, identityLock, { identityGateBaseMatchThreshold: 0.99 });
  assert.equal(resultHigh.matchThreshold, 0.99, 'matchThreshold should equal base threshold directly');

  // Default (no config) — should default to 0.8
  const resultDefault = evaluateSourceIdentity(source, identityLock, null);
  assert.equal(resultDefault.matchThreshold, 0.8, 'matchThreshold should default to 0.8');
});

test('retired dynamic threshold knobs are absent from SETTINGS_DEFAULTS.runtime', async () => {
  const mod = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const runtime = mod.SETTINGS_DEFAULTS.runtime;

  const retiredKnobs = [
    'identityGateEasyAmbiguityReduction',
    'identityGateMediumAmbiguityReduction',
    'identityGateHardAmbiguityReduction',
    'identityGateVeryHardAmbiguityIncrease',
    'identityGateExtraHardAmbiguityIncrease',
    'identityGateMissingStrongIdPenalty',
    'identityGateHardMissingStrongIdIncrease',
    'identityGateVeryHardMissingStrongIdIncrease',
    'identityGateExtraHardMissingStrongIdIncrease',
    'identityGateNumericTokenBoost',
    'identityGateNumericRangeThreshold',
    'identityGateThresholdBoundsMapJson',
    // Phase 5 retirement: base match + publish thresholds moved to hardcoded defaults
    'identityGateBaseMatchThreshold',
    'identityGatePublishThreshold',
  ];

  for (const key of retiredKnobs) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtime, key),
      false,
      `retired knob '${key}' should be absent from SETTINGS_DEFAULTS.runtime`,
    );
  }
});

test('NeedSet cap knobs are fully deleted from SETTINGS_DEFAULTS.convergence', async () => {
  const mod = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const convergence = mod.SETTINGS_DEFAULTS.convergence;

  const deletedKeys = [
    'needsetCapIdentityLocked',
    'needsetCapIdentityProvisional',
    'needsetCapIdentityConflict',
    'needsetCapIdentityUnlocked',
  ];
  for (const key of deletedKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(convergence, key),
      false,
      `deleted cap knob '${key}' should be absent from SETTINGS_DEFAULTS.convergence`,
    );
  }
});

test('confidenceCapForIdentityState is removed from needsetEngine', async () => {
  const mod = await import(pathToFileURL(NEEDSET_ENGINE_PATH).href);
  assert.equal(
    typeof mod.confidenceCapForIdentityState,
    'undefined',
    'confidenceCapForIdentityState should not be exported',
  );
});
