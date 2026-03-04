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
const INDEXING_PAGE_PATH = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_DOMAIN_PATH = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');
const INFRA_ROUTES_PATH = path.resolve('src/api/routes/infraRoutes.js');

test('runtime observability knobs are defaulted, contract-backed, and surfaced in pipeline runtime flow', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredStringKeys = [
    'importsRoot',
  ];
  const requiredBoolKeys = [
    'runtimeTraceLlmPayloads',
    'eventsJsonWrite',
    'indexingSchemaPacketsValidationEnabled',
    'indexingSchemaPacketsValidationStrict',
    'queueJsonWrite',
    'billingJsonWrite',
    'brainJsonWrite',
    'intelJsonWrite',
    'corpusJsonWrite',
    'learningJsonWrite',
    'cacheJsonWrite',
  ];
  const requiredIntKeys = [
    'runtimeTraceFetchRing',
    'runtimeTraceLlmRing',
    'indexingResumeSeedLimit',
    'indexingResumePersistLimit',
    'reCrawlStaleAfterDays',
    'daemonConcurrency',
    'daemonGracefulShutdownTimeoutMs',
    'importsPollSeconds',
  ];

  for (const key of requiredStringKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(
      runtimeKeys.has(key),
      true,
      `runtime key registry should include ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key),
      true,
      `runtime GET string map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.stringFreeMap || {}, key),
      true,
      `runtime PUT string map should expose ${key}`,
    );
    assert.equal(
      runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`),
      true,
      `runtime payload serializer should include normalized string for ${key}`,
    );
    assert.equal(
      indexingText.includes(`${key}: String(${key} || '').trim()`),
      true,
      `indexing run payload builder should include ${key}`,
    );
  }

  for (const key of requiredBoolKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(
      runtimeKeys.has(key),
      true,
      `runtime key registry should include ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.boolMap || {}, key),
      true,
      `runtime GET bool map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.boolMap || {}, key),
      true,
      `runtime PUT bool map should expose ${key}`,
    );
    assert.equal(runtimeDomainText.includes(`${key}: input.${key}`), true, `runtime payload serializer should include ${key}`);
    assert.equal(indexingText.includes(`${key},`) || indexingText.includes(`${key}:`), true, `indexing run payload builder should include ${key}`);
  }

  for (const key of requiredIntKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(
      runtimeKeys.has(key),
      true,
      `runtime key registry should include ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key),
      true,
      `runtime GET int map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key),
      true,
      `runtime PUT int map should expose ${key}`,
    );
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), true, `runtime payload serializer should include integer parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`) || indexingText.includes(`${key}:`), true, `indexing run payload builder should include ${key}`);
  }

  assert.equal(
    runtimeFlowText.includes('title="Observability and Trace"'),
    true,
    'runtime flow should expose an Observability and Trace panel',
  );
  assert.equal(
    runtimeFlowText.includes('label="Fetch Trace Ring Size"'),
    true,
    'runtime flow should expose fetch trace ring control',
  );
  assert.equal(
    runtimeFlowText.includes('label="LLM Trace Ring Size"'),
    true,
    'runtime flow should expose llm trace ring control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Trace LLM Payloads"'),
    true,
    'runtime flow should expose llm payload capture control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Events NDJSON Write"'),
    true,
    'runtime flow should expose events ndjson write control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Indexing Resume Seed Limit"'),
    true,
    'runtime flow should expose indexing resume seed limit control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Indexing Resume Persist Limit"'),
    true,
    'runtime flow should expose indexing resume persist limit control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Indexing Schema Validation Enabled"'),
    true,
    'runtime flow should expose indexing schema validation toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Indexing Schema Validation Strict"'),
    true,
    'runtime flow should expose indexing schema strict toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Re-Crawl Stale After (days)"'),
    true,
    'runtime flow should expose recrawl staleness control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Daemon Concurrency"'),
    true,
    'runtime flow should expose daemon concurrency control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Daemon Graceful Shutdown Timeout (ms)"'),
    true,
    'runtime flow should expose daemon graceful shutdown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Imports Root"'),
    true,
    'runtime flow should expose imports root control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Imports Poll Seconds"'),
    true,
    'runtime flow should expose imports poll seconds control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Queue JSON Write"'),
    true,
    'runtime flow should expose queue dual-write toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Billing JSON Write"'),
    true,
    'runtime flow should expose billing dual-write toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Brain JSON Write"'),
    true,
    'runtime flow should expose brain dual-write toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Intel JSON Write"'),
    true,
    'runtime flow should expose intel dual-write toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Corpus JSON Write"'),
    true,
    'runtime flow should expose corpus dual-write toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Learning JSON Write"'),
    true,
    'runtime flow should expose learning dual-write toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Cache JSON Write"'),
    true,
    'runtime flow should expose cache dual-write toggle',
  );

  const requiredEnvKeys = [
    'RUNTIME_TRACE_FETCH_RING',
    'RUNTIME_TRACE_LLM_RING',
    'RUNTIME_TRACE_LLM_PAYLOADS',
    'EVENTS_JSON_WRITE',
    'INDEXING_RESUME_SEED_LIMIT',
    'INDEXING_RESUME_PERSIST_LIMIT',
    'INDEXING_SCHEMA_PACKETS_VALIDATION_ENABLED',
    'INDEXING_SCHEMA_PACKETS_VALIDATION_STRICT',
    'RECRAWL_STALE_AFTER_DAYS',
    'DAEMON_CONCURRENCY',
    'DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS',
    'IMPORTS_ROOT',
    'IMPORTS_POLL_SECONDS',
    'QUEUE_JSON_WRITE',
    'BILLING_JSON_WRITE',
    'BRAIN_JSON_WRITE',
    'INTEL_JSON_WRITE',
    'CORPUS_JSON_WRITE',
    'LEARNING_JSON_WRITE',
    'CACHE_JSON_WRITE',
  ];
  for (const envKey of requiredEnvKeys) {
    assert.equal(
      infraRoutesText.includes(envKey),
      true,
      `process env override bridge should include ${envKey}`,
    );
  }
});
