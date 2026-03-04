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
const CONSENSUS_ENGINE_PATH = path.resolve('src/scoring/consensusEngine.js');
const IDENTITY_GATE_PATH = path.resolve('src/validator/identityGate.js');
const EVIDENCE_PACK_PATH = path.resolve('src/evidence/evidencePackV2.js');

test('hardcoded consensus + identity internals + evidence text cap knobs are wired through runtime settings and consumers', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);

  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);
  const consensusEngineText = readText(CONSENSUS_ENGINE_PATH);
  const identityGateText = readText(IDENTITY_GATE_PATH);
  const evidencePackText = readText(EVIDENCE_PACK_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredIntKeys = [
    'consensusStrictAcceptanceDomainCount',
    'consensusRelaxedAcceptanceDomainCount',
    'consensusInstrumentedFieldThreshold',
    'consensusPassTargetIdentityStrong',
    'consensusPassTargetNormal',
    'identityGateNumericRangeThreshold',
    'evidenceTextMaxChars',
  ];

  const requiredFloatKeys = [
    'consensusMethodWeightNetworkJson',
    'consensusMethodWeightAdapterApi',
    'consensusMethodWeightStructuredMeta',
    'consensusMethodWeightPdf',
    'consensusMethodWeightTableKv',
    'consensusMethodWeightDom',
    'consensusPolicyBonus',
    'consensusWeightedMajorityThreshold',
    'consensusConfidenceScoringBase',
    'identityGateHardMissingStrongIdIncrease',
    'identityGateVeryHardMissingStrongIdIncrease',
    'identityGateExtraHardMissingStrongIdIncrease',
    'identityGateNumericTokenBoost',
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
    'Consensus Method Weight (Network JSON)',
    'Consensus Method Weight (Adapter API)',
    'Consensus Method Weight (Structured Metadata)',
    'Consensus Method Weight (PDF)',
    'Consensus Method Weight (Table/KV)',
    'Consensus Method Weight (DOM)',
    'Consensus Policy Bonus',
    'Consensus Weighted Majority Threshold',
    'Consensus Strict Acceptance Domain Count',
    'Consensus Relaxed Acceptance Domain Count',
    'Consensus Instrumented Field Threshold',
    'Consensus Confidence Scoring Base',
    'Consensus Pass Target (Identity/Strong)',
    'Consensus Pass Target (Normal)',
    'Identity Gate Hard + Missing ID Increase',
    'Identity Gate Very Hard + Missing ID Increase',
    'Identity Gate Extra Hard + Missing ID Increase',
    'Identity Gate Numeric Token Boost',
    'Identity Gate Numeric Range Threshold',
    'Evidence Text Max Chars',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label="${label}"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'CONSENSUS_METHOD_WEIGHT_NETWORK_JSON',
    'CONSENSUS_METHOD_WEIGHT_ADAPTER_API',
    'CONSENSUS_METHOD_WEIGHT_STRUCTURED_META',
    'CONSENSUS_METHOD_WEIGHT_PDF',
    'CONSENSUS_METHOD_WEIGHT_TABLE_KV',
    'CONSENSUS_METHOD_WEIGHT_DOM',
    'CONSENSUS_POLICY_BONUS',
    'CONSENSUS_WEIGHTED_MAJORITY_THRESHOLD',
    'CONSENSUS_STRICT_ACCEPTANCE_DOMAIN_COUNT',
    'CONSENSUS_RELAXED_ACCEPTANCE_DOMAIN_COUNT',
    'CONSENSUS_INSTRUMENTED_FIELD_THRESHOLD',
    'CONSENSUS_CONFIDENCE_SCORING_BASE',
    'CONSENSUS_PASS_TARGET_IDENTITY_STRONG',
    'CONSENSUS_PASS_TARGET_NORMAL',
    'IDENTITY_GATE_HARD_MISSING_STRONG_ID_INCREASE',
    'IDENTITY_GATE_VERY_HARD_MISSING_STRONG_ID_INCREASE',
    'IDENTITY_GATE_EXTRA_HARD_MISSING_STRONG_ID_INCREASE',
    'IDENTITY_GATE_NUMERIC_TOKEN_BOOST',
    'IDENTITY_GATE_NUMERIC_RANGE_THRESHOLD',
    'EVIDENCE_TEXT_MAX_CHARS',
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

  assert.equal(consensusEngineText.includes('consensusMethodWeightNetworkJson'), true, 'consensus engine should consume consensusMethodWeightNetworkJson');
  assert.equal(consensusEngineText.includes('consensusMethodWeightAdapterApi'), true, 'consensus engine should consume consensusMethodWeightAdapterApi');
  assert.equal(consensusEngineText.includes('consensusMethodWeightStructuredMeta'), true, 'consensus engine should consume consensusMethodWeightStructuredMeta');
  assert.equal(consensusEngineText.includes('consensusMethodWeightPdf'), true, 'consensus engine should consume consensusMethodWeightPdf');
  assert.equal(consensusEngineText.includes('consensusMethodWeightTableKv'), true, 'consensus engine should consume consensusMethodWeightTableKv');
  assert.equal(consensusEngineText.includes('consensusMethodWeightDom'), true, 'consensus engine should consume consensusMethodWeightDom');
  assert.equal(consensusEngineText.includes('consensusPolicyBonus'), true, 'consensus engine should consume consensusPolicyBonus');
  assert.equal(consensusEngineText.includes('consensusWeightedMajorityThreshold'), true, 'consensus engine should consume consensusWeightedMajorityThreshold');
  assert.equal(consensusEngineText.includes('consensusStrictAcceptanceDomainCount'), true, 'consensus engine should consume consensusStrictAcceptanceDomainCount');
  assert.equal(consensusEngineText.includes('consensusRelaxedAcceptanceDomainCount'), true, 'consensus engine should consume consensusRelaxedAcceptanceDomainCount');
  assert.equal(consensusEngineText.includes('consensusInstrumentedFieldThreshold'), true, 'consensus engine should consume consensusInstrumentedFieldThreshold');
  assert.equal(consensusEngineText.includes('consensusConfidenceScoringBase'), true, 'consensus engine should consume consensusConfidenceScoringBase');
  assert.equal(consensusEngineText.includes('consensusPassTargetIdentityStrong'), true, 'consensus engine should consume consensusPassTargetIdentityStrong');
  assert.equal(consensusEngineText.includes('consensusPassTargetNormal'), true, 'consensus engine should consume consensusPassTargetNormal');

  assert.equal(identityGateText.includes('identityGateHardMissingStrongIdIncrease'), true, 'identity gate should consume identityGateHardMissingStrongIdIncrease');
  assert.equal(identityGateText.includes('identityGateVeryHardMissingStrongIdIncrease'), true, 'identity gate should consume identityGateVeryHardMissingStrongIdIncrease');
  assert.equal(identityGateText.includes('identityGateExtraHardMissingStrongIdIncrease'), true, 'identity gate should consume identityGateExtraHardMissingStrongIdIncrease');
  assert.equal(identityGateText.includes('identityGateNumericTokenBoost'), true, 'identity gate should consume identityGateNumericTokenBoost');
  assert.equal(identityGateText.includes('identityGateNumericRangeThreshold'), true, 'identity gate should consume identityGateNumericRangeThreshold');

  assert.equal(evidencePackText.includes('evidenceTextMaxChars'), true, 'evidence pack should consume evidenceTextMaxChars');
});
