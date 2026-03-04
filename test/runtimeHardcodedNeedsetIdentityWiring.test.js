import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const SETTINGS_DEFAULTS_PATH = path.resolve('src/shared/settingsDefaults.js');
const SETTINGS_CONTRACT_PATH = path.resolve('src/api/services/settingsContract.js');
const RUNTIME_FLOW_PATH = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');
const RUNTIME_DOMAIN_PATH = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');
const INFRA_ROUTES_PATH = path.resolve('src/api/routes/infraRoutes.js');
const CONFIG_PATH = path.resolve('src/config.js');
const NEEDSET_ENGINE_PATH = path.resolve('src/indexlab/needsetEngine.js');
const IDENTITY_GATE_PATH = path.resolve('src/validator/identityGate.js');
const QUALITY_GATE_PATH = path.resolve('src/validator/qualityGate.js');
const IDENTITY_HELPERS_PATH = path.resolve('src/pipeline/helpers/identityHelpers.js');

test('hardcoded needset + identity-gate knobs are wired through runtime settings and runtime consumers', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);

  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);
  const needsetEngineText = readText(NEEDSET_ENGINE_PATH);
  const identityGateText = readText(IDENTITY_GATE_PATH);
  const qualityGateText = readText(QUALITY_GATE_PATH);
  const identityHelpersText = readText(IDENTITY_HELPERS_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredIntKeys = [
    'needsetDefaultIdentityAuditLimit',
  ];

  const requiredFloatKeys = [
    'needsetRequiredWeightIdentity',
    'needsetRequiredWeightCritical',
    'needsetRequiredWeightRequired',
    'needsetRequiredWeightExpected',
    'needsetRequiredWeightOptional',
    'needsetMissingMultiplier',
    'needsetTierDeficitMultiplier',
    'needsetMinRefsDeficitMultiplier',
    'needsetConflictMultiplier',
    'needsetIdentityLockThreshold',
    'needsetIdentityProvisionalThreshold',
    'identityGateBaseMatchThreshold',
    'identityGateEasyAmbiguityReduction',
    'identityGateMediumAmbiguityReduction',
    'identityGateHardAmbiguityReduction',
    'identityGateVeryHardAmbiguityIncrease',
    'identityGateExtraHardAmbiguityIncrease',
    'identityGateMissingStrongIdPenalty',
    'qualityGateIdentityThreshold',
  ];

  for (const key of requiredIntKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key), true, `runtime GET int map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key), true, `runtime PUT int map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), true, `runtime payload serializer should include integer parser for ${key}`);
  }

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
  }

  const requiredRuntimeFlowLabels = [
    'NeedSet Required Weight (Identity)',
    'NeedSet Required Weight (Critical)',
    'NeedSet Required Weight (Required)',
    'NeedSet Required Weight (Expected)',
    'NeedSet Required Weight (Optional)',
    'NeedSet Missing Multiplier',
    'NeedSet Tier Deficit Multiplier',
    'NeedSet Min-Refs Deficit Multiplier',
    'NeedSet Conflict Multiplier',
    'NeedSet Identity Lock Threshold',
    'NeedSet Identity Provisional Threshold',
    'NeedSet Identity Audit Limit',
    'Identity Gate Base Match Threshold',
    'Identity Gate Easy Ambiguity Reduction',
    'Identity Gate Medium Ambiguity Reduction',
    'Identity Gate Hard Ambiguity Reduction',
    'Identity Gate Very Hard Ambiguity Increase',
    'Identity Gate Extra Hard Ambiguity Increase',
    'Identity Gate Missing Strong ID Penalty',
    'Quality Gate Identity Threshold',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label="${label}"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'NEEDSET_REQUIRED_WEIGHT_IDENTITY',
    'NEEDSET_REQUIRED_WEIGHT_CRITICAL',
    'NEEDSET_REQUIRED_WEIGHT_REQUIRED',
    'NEEDSET_REQUIRED_WEIGHT_EXPECTED',
    'NEEDSET_REQUIRED_WEIGHT_OPTIONAL',
    'NEEDSET_MISSING_MULTIPLIER',
    'NEEDSET_TIER_DEFICIT_MULTIPLIER',
    'NEEDSET_MIN_REFS_DEFICIT_MULTIPLIER',
    'NEEDSET_CONFLICT_MULTIPLIER',
    'NEEDSET_IDENTITY_LOCK_THRESHOLD',
    'NEEDSET_IDENTITY_PROVISIONAL_THRESHOLD',
    'NEEDSET_DEFAULT_IDENTITY_AUDIT_LIMIT',
    'IDENTITY_GATE_BASE_MATCH_THRESHOLD',
    'IDENTITY_GATE_EASY_AMBIGUITY_REDUCTION',
    'IDENTITY_GATE_MEDIUM_AMBIGUITY_REDUCTION',
    'IDENTITY_GATE_HARD_AMBIGUITY_REDUCTION',
    'IDENTITY_GATE_VERY_HARD_AMBIGUITY_INCREASE',
    'IDENTITY_GATE_EXTRA_HARD_AMBIGUITY_INCREASE',
    'IDENTITY_GATE_MISSING_STRONG_ID_PENALTY',
    'QUALITY_GATE_IDENTITY_THRESHOLD',
  ];

  for (const envKey of requiredEnvKeys) {
    assert.equal(
      infraRoutesText.includes(envKey),
      true,
      `process env override bridge should include ${envKey}`,
    );
    assert.equal(
      configText.includes(`'${envKey}'`),
      true,
      `runtime config should parse ${envKey}`,
    );
  }

  assert.equal(needsetEngineText.includes('needsetRequiredWeightIdentity'), true, 'needset engine should consume needsetRequiredWeightIdentity');
  assert.equal(needsetEngineText.includes('needsetRequiredWeightCritical'), true, 'needset engine should consume needsetRequiredWeightCritical');
  assert.equal(needsetEngineText.includes('needsetRequiredWeightRequired'), true, 'needset engine should consume needsetRequiredWeightRequired');
  assert.equal(needsetEngineText.includes('needsetRequiredWeightExpected'), true, 'needset engine should consume needsetRequiredWeightExpected');
  assert.equal(needsetEngineText.includes('needsetRequiredWeightOptional'), true, 'needset engine should consume needsetRequiredWeightOptional');
  assert.equal(needsetEngineText.includes('needsetMissingMultiplier'), true, 'needset engine should consume needsetMissingMultiplier');
  assert.equal(needsetEngineText.includes('needsetTierDeficitMultiplier'), true, 'needset engine should consume needsetTierDeficitMultiplier');
  assert.equal(needsetEngineText.includes('needsetMinRefsDeficitMultiplier'), true, 'needset engine should consume needsetMinRefsDeficitMultiplier');
  assert.equal(needsetEngineText.includes('needsetConflictMultiplier'), true, 'needset engine should consume needsetConflictMultiplier');
  assert.equal(needsetEngineText.includes('needsetIdentityLockThreshold'), true, 'needset engine should consume needsetIdentityLockThreshold');
  assert.equal(needsetEngineText.includes('needsetIdentityProvisionalThreshold'), true, 'needset engine should consume needsetIdentityProvisionalThreshold');
  assert.equal(needsetEngineText.includes('needsetDefaultIdentityAuditLimit'), true, 'needset engine should consume needsetDefaultIdentityAuditLimit');
  assert.equal(identityHelpersText.includes('identityLockThreshold'), true, 'identity helpers should consume identityLockThreshold');
  assert.equal(identityHelpersText.includes('identityProvisionalThreshold'), true, 'identity helpers should consume identityProvisionalThreshold');
  assert.equal(identityGateText.includes('identityGateBaseMatchThreshold'), true, 'identity gate should consume identityGateBaseMatchThreshold');
  assert.equal(identityGateText.includes('identityGateEasyAmbiguityReduction'), true, 'identity gate should consume identityGateEasyAmbiguityReduction');
  assert.equal(identityGateText.includes('identityGateMediumAmbiguityReduction'), true, 'identity gate should consume identityGateMediumAmbiguityReduction');
  assert.equal(identityGateText.includes('identityGateHardAmbiguityReduction'), true, 'identity gate should consume identityGateHardAmbiguityReduction');
  assert.equal(identityGateText.includes('identityGateVeryHardAmbiguityIncrease'), true, 'identity gate should consume identityGateVeryHardAmbiguityIncrease');
  assert.equal(identityGateText.includes('identityGateExtraHardAmbiguityIncrease'), true, 'identity gate should consume identityGateExtraHardAmbiguityIncrease');
  assert.equal(identityGateText.includes('identityGateMissingStrongIdPenalty'), true, 'identity gate should consume identityGateMissingStrongIdPenalty');
  assert.equal(qualityGateText.includes('qualityGateIdentityThreshold'), true, 'quality gate should consume qualityGateIdentityThreshold');
});
