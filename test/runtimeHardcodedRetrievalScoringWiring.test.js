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
const TIER_AWARE_RETRIEVER_PATH = path.resolve('src/retrieve/tierAwareRetriever.js');

test('hardcoded retrieval scoring internals are wired through runtime settings and phase-07 retrieval scoring consumers', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);

  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);
  const runProductText = readText(RUN_PRODUCT_PATH);
  const tierAwareRetrieverText = readText(TIER_AWARE_RETRIEVER_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredFloatKeys = [
    'retrievalTierWeightTier1',
    'retrievalTierWeightTier2',
    'retrievalTierWeightTier3',
    'retrievalTierWeightTier4',
    'retrievalTierWeightTier5',
    'retrievalDocKindWeightManualPdf',
    'retrievalDocKindWeightSpecPdf',
    'retrievalDocKindWeightSupport',
    'retrievalDocKindWeightLabReview',
    'retrievalDocKindWeightProductPage',
    'retrievalDocKindWeightOther',
    'retrievalMethodWeightTable',
    'retrievalMethodWeightKv',
    'retrievalMethodWeightJsonLd',
    'retrievalMethodWeightLlmExtract',
    'retrievalMethodWeightHelperSupportive',
    'retrievalAnchorScorePerMatch',
    'retrievalIdentityScorePerMatch',
    'retrievalUnitMatchBonus',
    'retrievalDirectFieldMatchBonus',
  ];

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
  }

  const requiredRuntimeFlowLabels = [
    'Retrieval Tier Weight (Tier 1)',
    'Retrieval Tier Weight (Tier 2)',
    'Retrieval Tier Weight (Tier 3)',
    'Retrieval Tier Weight (Tier 4)',
    'Retrieval Tier Weight (Tier 5)',
    'Retrieval Doc Weight (Manual PDF)',
    'Retrieval Doc Weight (Spec PDF)',
    'Retrieval Doc Weight (Support)',
    'Retrieval Doc Weight (Lab Review)',
    'Retrieval Doc Weight (Product Page)',
    'Retrieval Doc Weight (Other)',
    'Retrieval Method Weight (Table)',
    'Retrieval Method Weight (KV)',
    'Retrieval Method Weight (JSON-LD)',
    'Retrieval Method Weight (LLM Extract)',
    'Retrieval Method Weight (Helper Supportive)',
    'Retrieval Anchor Score Per Match',
    'Retrieval Identity Score Per Match',
    'Retrieval Unit Match Bonus',
    'Retrieval Direct Field Match Bonus',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label="${label}"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'RETRIEVAL_TIER_WEIGHT_TIER1',
    'RETRIEVAL_TIER_WEIGHT_TIER2',
    'RETRIEVAL_TIER_WEIGHT_TIER3',
    'RETRIEVAL_TIER_WEIGHT_TIER4',
    'RETRIEVAL_TIER_WEIGHT_TIER5',
    'RETRIEVAL_DOC_KIND_WEIGHT_MANUAL_PDF',
    'RETRIEVAL_DOC_KIND_WEIGHT_SPEC_PDF',
    'RETRIEVAL_DOC_KIND_WEIGHT_SUPPORT',
    'RETRIEVAL_DOC_KIND_WEIGHT_LAB_REVIEW',
    'RETRIEVAL_DOC_KIND_WEIGHT_PRODUCT_PAGE',
    'RETRIEVAL_DOC_KIND_WEIGHT_OTHER',
    'RETRIEVAL_METHOD_WEIGHT_TABLE',
    'RETRIEVAL_METHOD_WEIGHT_KV',
    'RETRIEVAL_METHOD_WEIGHT_JSON_LD',
    'RETRIEVAL_METHOD_WEIGHT_LLM_EXTRACT',
    'RETRIEVAL_METHOD_WEIGHT_HELPER_SUPPORTIVE',
    'RETRIEVAL_ANCHOR_SCORE_PER_MATCH',
    'RETRIEVAL_IDENTITY_SCORE_PER_MATCH',
    'RETRIEVAL_UNIT_MATCH_BONUS',
    'RETRIEVAL_DIRECT_FIELD_MATCH_BONUS',
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

  for (const key of requiredFloatKeys) {
    assert.equal(
      runProductText.includes(key),
      true,
      `runProduct phase-07 options should forward ${key}`,
    );
    assert.equal(
      tierAwareRetrieverText.includes(key),
      true,
      `tier-aware retrieval scoring should consume ${key}`,
    );
  }
});
