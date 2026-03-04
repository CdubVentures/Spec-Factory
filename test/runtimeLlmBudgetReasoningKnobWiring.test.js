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

test('runtime llm budget/reasoning knobs are defaulted, contract-backed, and surfaced in pipeline runtime flow', async () => {
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

  const requiredBoolKeys = [
    'llmExtractSkipLowSignal',
    'llmReasoningMode',
    'llmDisableBudgetGuards',
    'llmVerifyMode',
  ];
  const requiredIntKeys = [
    'needsetEvidenceDecayDays',
    'llmExtractMaxTokens',
    'llmExtractMaxSnippetsPerBatch',
    'llmExtractMaxSnippetChars',
    'llmExtractReasoningBudget',
    'llmReasoningBudget',
    'llmMaxBatchesPerProduct',
    'llmMaxEvidenceChars',
    'llmMaxTokens',
    'llmTimeoutMs',
  ];
  const requiredFloatKeys = [
    'needsetEvidenceDecayFloor',
    'llmMonthlyBudgetUsd',
    'llmPerProductBudgetUsd',
    'llmCostInputPer1M',
    'llmCostOutputPer1M',
    'llmCostCachedInputPer1M',
  ];

  for (const key of requiredBoolKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.boolMap || {}, key), true, `runtime GET bool map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.boolMap || {}, key), true, `runtime PUT bool map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: input.${key}`), true, `runtime payload serializer should include ${key}`);
    assert.equal(indexingText.includes(`${key},`) || indexingText.includes(`${key}:`), true, `indexing run payload builder should include ${key}`);
  }

  for (const key of requiredIntKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key), true, `runtime GET int map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key), true, `runtime PUT int map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), true, `runtime payload serializer should include integer parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`) || indexingText.includes(`${key}:`), true, `indexing run payload builder should include ${key}`);
  }

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`) || indexingText.includes(`${key}:`), true, `indexing run payload builder should include ${key}`);
  }

  const requiredLabels = [
    'NeedSet Evidence Decay Days',
    'NeedSet Evidence Decay Floor',
    'LLM Extract Max Tokens',
    'LLM Extract Max Snippets/Batch',
    'LLM Extract Max Snippet Chars',
    'LLM Extract Skip Low Signal',
    'LLM Extract Reasoning Budget',
    'LLM Reasoning Mode',
    'LLM Reasoning Budget',
    'LLM Monthly Budget (USD)',
    'LLM Per-Product Budget (USD)',
    'Disable LLM Budget Guards',
    'LLM Max Batches/Product',
    'LLM Max Evidence Chars',
    'LLM Max Tokens',
    'LLM Timeout (ms)',
    'LLM Cost Input / 1M',
    'LLM Cost Output / 1M',
    'LLM Cost Cached Input / 1M',
    'LLM Verify Mode',
  ];
  for (const label of requiredLabels) {
    assert.equal(runtimeFlowText.includes(`label="${label}"`), true, `runtime flow should expose ${label}`);
  }

  const requiredEnvKeys = [
    'NEEDSET_EVIDENCE_DECAY_DAYS',
    'NEEDSET_EVIDENCE_DECAY_FLOOR',
    'LLM_EXTRACT_MAX_TOKENS',
    'LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH',
    'LLM_EXTRACT_MAX_SNIPPET_CHARS',
    'LLM_EXTRACT_SKIP_LOW_SIGNAL',
    'LLM_EXTRACT_REASONING_BUDGET',
    'LLM_REASONING_MODE',
    'LLM_REASONING_BUDGET',
    'LLM_MONTHLY_BUDGET_USD',
    'LLM_PER_PRODUCT_BUDGET_USD',
    'LLM_DISABLE_BUDGET_GUARDS',
    'LLM_MAX_BATCHES_PER_PRODUCT',
    'LLM_MAX_EVIDENCE_CHARS',
    'LLM_MAX_TOKENS',
    'LLM_TIMEOUT_MS',
    'LLM_COST_INPUT_PER_1M',
    'LLM_COST_OUTPUT_PER_1M',
    'LLM_COST_CACHED_INPUT_PER_1M',
    'LLM_VERIFY_MODE',
  ];
  for (const envKey of requiredEnvKeys) {
    assert.equal(infraRoutesText.includes(envKey), true, `process env override bridge should include ${envKey}`);
  }
});
