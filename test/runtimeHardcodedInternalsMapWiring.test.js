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
const RUN_PRODUCT_PATH = path.resolve('src/pipeline/runProduct.js');
const FETCH_SCHEDULER_PATH = path.resolve('src/concurrency/fetchScheduler.js');
const PRIME_SOURCES_BUILDER_PATH = path.resolve('src/retrieve/primeSourcesBuilder.js');
const TIER_AWARE_RETRIEVER_PATH = path.resolve('src/retrieve/tierAwareRetriever.js');
const EVIDENCE_PACK_PATH = path.resolve('src/evidence/evidencePackV2.js');
const CONSENSUS_ENGINE_PATH = path.resolve('src/scoring/consensusEngine.js');
const IDENTITY_GATE_PATH = path.resolve('src/validator/identityGate.js');

test('hardcoded internals are surfaced through runtime map knobs and wired into runtime consumers', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);

  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);
  const runProductText = readText(RUN_PRODUCT_PATH);
  const fetchSchedulerText = readText(FETCH_SCHEDULER_PATH);
  const primeSourcesBuilderText = readText(PRIME_SOURCES_BUILDER_PATH);
  const tierAwareRetrieverText = readText(TIER_AWARE_RETRIEVER_PATH);
  const evidencePackText = readText(EVIDENCE_PACK_PATH);
  const consensusEngineText = readText(CONSENSUS_ENGINE_PATH);
  const identityGateText = readText(IDENTITY_GATE_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredStringMapKeys = [
    'fetchSchedulerInternalsMapJson',
    'retrievalInternalsMapJson',
    'evidencePackLimitsMapJson',
    'identityGateThresholdBoundsMapJson',
  ];
  const requiredFloatKeys = [
    'consensusMethodWeightLlmExtractBase',
  ];

  for (const key of requiredStringMapKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringTrimMap || {}, key), true, `runtime PUT string map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeString(`), true, `runtime payload serializer should include string parser for ${key}`);
  }

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
  }

  const requiredRuntimeFlowLabels = [
    'Fetch Scheduler Internals Map (JSON)',
    'Retrieval Internals Map (JSON)',
    'Evidence Pack Limits Map (JSON)',
    'Identity Gate Threshold Bounds Map (JSON)',
    'Consensus Method Weight (LLM Extract Base)',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label="${label}"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'FETCH_SCHEDULER_INTERNALS_MAP_JSON',
    'RETRIEVAL_INTERNALS_MAP_JSON',
    'EVIDENCE_PACK_LIMITS_MAP_JSON',
    'IDENTITY_GATE_THRESHOLD_BOUNDS_MAP_JSON',
    'CONSENSUS_METHOD_WEIGHT_LLM_EXTRACT_BASE',
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

  const requiredConsumerTokens = [
    'fetchSchedulerInternalsMapJson',
    'retrievalInternalsMapJson',
    'evidencePackLimitsMapJson',
    'identityGateThresholdBoundsMapJson',
    'consensusMethodWeightLlmExtractBase',
  ];

  for (const token of requiredConsumerTokens) {
    assert.equal(runProductText.includes(token), true, `runProduct should forward ${token}`);
  }

  assert.equal(fetchSchedulerText.includes('defaultConcurrency'), true, 'fetch scheduler should consume defaultConcurrency runtime map value');
  assert.equal(fetchSchedulerText.includes('defaultPerHostDelayMs'), true, 'fetch scheduler should consume defaultPerHostDelayMs runtime map value');
  assert.equal(fetchSchedulerText.includes('defaultMaxRetries'), true, 'fetch scheduler should consume defaultMaxRetries runtime map value');
  assert.equal(fetchSchedulerText.includes('retryWaitMs'), true, 'fetch scheduler should consume retryWaitMs runtime map value');

  assert.equal(primeSourcesBuilderText.includes('retrievalEvidencePoolMaxRows'), true, 'prime sources builder should consume retrieval evidence pool max rows');
  assert.equal(primeSourcesBuilderText.includes('retrievalSnippetsPerSourceCap'), true, 'prime sources builder should consume retrieval snippets-per-source cap');
  assert.equal(primeSourcesBuilderText.includes('retrievalFallbackEvidenceMaxRows'), true, 'prime sources builder should consume retrieval fallback evidence max rows');
  assert.equal(primeSourcesBuilderText.includes('retrievalProvenanceOnlyMinRows'), true, 'prime sources builder should consume retrieval provenance-only min rows');

  assert.equal(tierAwareRetrieverText.includes('retrievalEvidenceTierWeightMultiplier'), true, 'tier-aware retriever should consume retrieval evidence tier-weight multiplier');
  assert.equal(tierAwareRetrieverText.includes('retrievalEvidenceDocWeightMultiplier'), true, 'tier-aware retriever should consume retrieval evidence doc-weight multiplier');
  assert.equal(tierAwareRetrieverText.includes('retrievalEvidenceMethodWeightMultiplier'), true, 'tier-aware retriever should consume retrieval evidence method-weight multiplier');
  assert.equal(tierAwareRetrieverText.includes('retrievalEvidenceRefsLimit'), true, 'tier-aware retriever should consume retrieval evidence refs limit');
  assert.equal(tierAwareRetrieverText.includes('retrievalReasonBadgesLimit'), true, 'tier-aware retriever should consume retrieval reason-badges limit');
  assert.equal(tierAwareRetrieverText.includes('retrievalAnchorsLimit'), true, 'tier-aware retriever should consume retrieval anchors limit');

  assert.equal(evidencePackText.includes('evidenceHeadingsLimit'), true, 'evidence pack builder should consume evidence headings limit');
  assert.equal(evidencePackText.includes('evidenceChunkMaxLength'), true, 'evidence pack builder should consume evidence chunk max length');
  assert.equal(evidencePackText.includes('evidenceSpecSectionsLimit'), true, 'evidence pack builder should consume evidence spec sections limit');

  assert.equal(consensusEngineText.includes('consensusMethodWeightLlmExtractBase'), true, 'consensus engine should consume llm-extract base method weight');

  assert.equal(identityGateText.includes('identityGateThresholdFloor'), true, 'identity gate should consume threshold floor');
  assert.equal(identityGateText.includes('identityGateThresholdCeiling'), true, 'identity gate should consume threshold ceiling');
});
