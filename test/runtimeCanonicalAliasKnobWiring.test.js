import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const DEFAULTS_PATH = 'src/shared/settingsDefaults.js';
const MANIFEST_PATH = 'tools/gui-react/src/stores/settingsManifest.ts';
const CONTRACT_PATH = 'src/api/services/settingsContract.js';
const DOMAIN_PATH = 'tools/gui-react/src/stores/runtimeSettingsDomain.ts';
const INDEXING_PAGE_PATH = 'tools/gui-react/src/pages/indexing/IndexingPage.tsx';
const RUNTIME_FLOW_PATH = 'tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx';

const CANONICAL_ALIAS_KNOBS = Object.freeze([
  'runProfile',
  'llmModelPlan',
  'llmModelTriage',
  'llmPlanDiscoveryQueries',
  'llmSerpRerankEnabled',
  'llmPlanFallbackModel',
  'llmExtractFallbackModel',
  'llmValidateFallbackModel',
  'llmWriteFallbackModel',
  'llmMaxOutputTokensPlan',
  'llmMaxOutputTokensTriage',
  'llmMaxOutputTokensFast',
  'llmMaxOutputTokensReasoning',
  'llmMaxOutputTokensExtract',
  'llmMaxOutputTokensValidate',
  'llmMaxOutputTokensWrite',
  'llmMaxOutputTokensPlanFallback',
  'llmMaxOutputTokensExtractFallback',
  'llmMaxOutputTokensValidateFallback',
  'llmMaxOutputTokensWriteFallback',
]);

test('runtime canonical alias knobs are wired across defaults, manifest, domain, and runtime flow payloads', async () => {
  const [defaultsText, manifestText, contractText, domainText, indexingText, runtimeFlowText] = await Promise.all([
    fs.readFile(DEFAULTS_PATH, 'utf8'),
    fs.readFile(MANIFEST_PATH, 'utf8'),
    fs.readFile(CONTRACT_PATH, 'utf8'),
    fs.readFile(DOMAIN_PATH, 'utf8'),
    fs.readFile(INDEXING_PAGE_PATH, 'utf8'),
    fs.readFile(RUNTIME_FLOW_PATH, 'utf8'),
  ]);

  for (const key of CANONICAL_ALIAS_KNOBS) {
    assert.equal(
      new RegExp(`\\b${key}:`).test(defaultsText),
      true,
      `runtime defaults should include canonical alias ${key}`,
    );
    assert.equal(
      new RegExp(`\\b${key}:`).test(manifestText),
      true,
      `runtime manifest should include canonical alias ${key}`,
    );
    assert.equal(
      contractText.includes(`'${key}'`),
      true,
      `runtime contract key list should include canonical alias ${key}`,
    );
    assert.equal(
      domainText.includes(key),
      true,
      `runtime domain should include canonical alias ${key}`,
    );
    assert.equal(
      runtimeFlowText.includes(key),
      true,
      `runtime flow serializer/hydration should include canonical alias ${key}`,
    );
    assert.equal(
      indexingText.includes(key),
      true,
      `indexing page payload wiring should include canonical alias ${key}`,
    );
  }
});
