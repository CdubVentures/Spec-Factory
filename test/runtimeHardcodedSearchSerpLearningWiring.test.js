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
const SEARCH_DISCOVERY_PATH = path.resolve('src/discovery/searchDiscovery.js');
const SERP_RERANKER_PATH = path.resolve('src/research/serpReranker.js');
const FRONTIER_DB_PATH = path.resolve('src/research/frontierDb.js');
const FRONTIER_SQLITE_PATH = path.resolve('src/research/frontierSqlite.js');
const LEARNING_READBACK_PATH = path.resolve('src/learning/learningReadback.js');
const LEARNING_UPDATER_PATH = path.resolve('src/learning/learningUpdater.js');

test('hardcoded search/serp/frontier/learning knobs are fully wired through runtime settings and runtime consumers', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);

  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);
  const searchDiscoveryText = readText(SEARCH_DISCOVERY_PATH);
  const serpRerankerText = readText(SERP_RERANKER_PATH);
  const frontierDbText = readText(FRONTIER_DB_PATH);
  const frontierSqliteText = readText(FRONTIER_SQLITE_PATH);
  const learningReadbackText = readText(LEARNING_READBACK_PATH);
  const learningUpdaterText = readText(LEARNING_UPDATER_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredStringKeys = [
    'searchProfileCapMapJson',
    'serpRerankerWeightMapJson',
  ];
  const requiredIntKeys = [
    'frontierBackoffMaxExponent',
    'frontierPathPenaltyNotfoundThreshold',
    'componentLexiconDecayDays',
    'componentLexiconExpireDays',
    'fieldAnchorsDecayDays',
    'urlMemoryDecayDays',
  ];
  const requiredFloatKeys = [
    'learningConfidenceThreshold',
  ];

  for (const key of requiredStringKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringFreeMap || {}, key), true, `runtime PUT string map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`), true, `runtime payload serializer should include normalized string for ${key}`);
  }

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
    'Search Profile Caps Map (JSON)',
    'SERP Reranker Weight Map (JSON)',
    'Frontier Backoff Max Exponent',
    'Frontier Path Penalty Not-Found Threshold',
    'Learning Confidence Threshold',
    'Component Lexicon Decay Days',
    'Component Lexicon Expire Days',
    'Field Anchors Decay Days',
    'URL Memory Decay Days',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label=\"${label}\"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'SEARCH_PROFILE_CAP_MAP_JSON',
    'SERP_RERANKER_WEIGHT_MAP_JSON',
    'FRONTIER_BACKOFF_MAX_EXPONENT',
    'FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD',
    'LEARNING_CONFIDENCE_THRESHOLD',
    'COMPONENT_LEXICON_DECAY_DAYS',
    'COMPONENT_LEXICON_EXPIRE_DAYS',
    'FIELD_ANCHORS_DECAY_DAYS',
    'URL_MEMORY_DECAY_DAYS',
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

  assert.equal(searchDiscoveryText.includes('searchProfileCapMap'), true, 'search discovery should consume searchProfileCapMap');
  assert.equal(serpRerankerText.includes('serpRerankerWeightMap'), true, 'serp reranker should consume serpRerankerWeightMap');
  assert.equal(frontierDbText.includes('frontierBackoffMaxExponent'), true, 'frontier db should consume frontierBackoffMaxExponent');
  assert.equal(frontierDbText.includes('frontierPathPenaltyNotfoundThreshold'), true, 'frontier db should consume frontierPathPenaltyNotfoundThreshold');
  assert.equal(frontierSqliteText.includes('frontierBackoffMaxExponent'), true, 'frontier sqlite should consume frontierBackoffMaxExponent');
  assert.equal(frontierSqliteText.includes('frontierPathPenaltyNotfoundThreshold'), true, 'frontier sqlite should consume frontierPathPenaltyNotfoundThreshold');
  assert.equal(learningReadbackText.includes('componentLexiconDecayDays'), true, 'learning readback should consume component lexicon decay days');
  assert.equal(learningReadbackText.includes('componentLexiconExpireDays'), true, 'learning readback should consume component lexicon expire days');
  assert.equal(learningReadbackText.includes('fieldAnchorsDecayDays'), true, 'learning readback should consume field anchors decay days');
  assert.equal(learningReadbackText.includes('urlMemoryDecayDays'), true, 'learning readback should consume url memory decay days');
  assert.equal(learningUpdaterText.includes('learningConfidenceThreshold'), true, 'learning gate should consume learning confidence threshold');
});
