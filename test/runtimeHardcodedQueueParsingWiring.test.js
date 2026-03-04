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
const CONSENSUS_ENGINE_PATH = path.resolve('src/scoring/consensusEngine.js');
const FIELD_AGGREGATOR_PATH = path.resolve('src/scoring/fieldAggregator.js');
const AUTOMATION_QUEUE_PATH = path.resolve('src/pipeline/automationQueue.js');

test('final hardcoded queue/parsing knobs are surfaced through runtime settings and wired into runtime consumers', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);

  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);
  const runProductText = readText(RUN_PRODUCT_PATH);
  const consensusEngineText = readText(CONSENSUS_ENGINE_PATH);
  const fieldAggregatorText = readText(FIELD_AGGREGATOR_PATH);
  const automationQueueText = readText(AUTOMATION_QUEUE_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredStringMapKeys = [
    'parsingConfidenceBaseMapJson',
  ];
  const requiredEnumKeys = [
    'repairDedupeRule',
    'automationQueueStorageEngine',
  ];

  for (const key of requiredStringMapKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringTrimMap || {}, key), true, `runtime PUT string trim map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeString(`), true, `runtime payload serializer should include string parser for ${key}`);
  }

  for (const key of requiredEnumKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringEnumMap || {}, key), true, `runtime PUT enum map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: String(`), true, `runtime payload serializer should include string normalization for ${key}`);
  }

  const requiredRuntimeFlowLabels = [
    'Parsing Confidence Base Map (JSON)',
    'Repair Dedupe Rule',
    'Automation Queue Storage Engine',
  ];
  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(runtimeFlowText.includes(`label="${label}"`), true, `runtime flow should expose ${label}`);
  }

  const requiredEnvKeys = [
    'PARSING_CONFIDENCE_BASE_MAP_JSON',
    'REPAIR_DEDUPE_RULE',
    'AUTOMATION_QUEUE_STORAGE_ENGINE',
  ];
  for (const envKey of requiredEnvKeys) {
    assert.equal(infraRoutesText.includes(envKey), true, `process env override bridge should include ${envKey}`);
    assert.equal(configText.includes(`'${envKey}'`), true, `runtime config should parse ${envKey}`);
  }

  assert.equal(runProductText.includes('repairDedupeRule'), true, 'runProduct should consume repair dedupe rule');
  assert.equal(runProductText.includes('parsingConfidenceBaseMapJson'), true, 'runProduct should forward parsing confidence base map');
  assert.equal(consensusEngineText.includes('parsingConfidenceBaseMap'), true, 'consensus engine should consume parsing confidence base map');
  assert.equal(fieldAggregatorText.includes('parsingConfidenceBaseMap'), true, 'field aggregator should consume parsing confidence base map');
  assert.equal(automationQueueText.includes('automationQueueStorageEngine'), true, 'automation queue should consume storage engine setting');
});
