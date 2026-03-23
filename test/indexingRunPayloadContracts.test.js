import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

function createBaseline(overrides = {}, fallback = 11) {
  return new Proxy(overrides, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return target[prop];
      }
      return fallback;
    },
  });
}

function createPayload(overrides = {}) {
  return new Proxy(overrides, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return target[prop];
      }
      return '';
    },
  });
}

function createParsedValues(overrides = {}) {
  return new Proxy(overrides, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return target[prop];
      }
      return 0;
    },
  });
}

async function loadRunStartPayloadModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/indexing/api/indexingRunStartPayload.ts',
    {
      prefix: 'indexing-run-start-payload-',
      stubs: {
        '../../../stores/settingsManifest': `
          export const LLM_SETTING_LIMITS = {
            maxTokens: { min: 256 },
          };
        `,
      },
    },
  );
}

test('deriveIndexingRunStartParsedValues parses runtime numeric settings and falls back to baseline', async () => {
  const { deriveIndexingRunStartParsedValues } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/api/indexingRunStartParsedValues.ts',
    { prefix: 'indexing-run-start-parsed-' },
  );

  const parsed = deriveIndexingRunStartParsedValues({
    runtimeSettingsPayload: {
      fetchConcurrency: 'bad-value',
      runtimeScreencastFps: '7',
      scannedPdfOcrMinConfidence: '0.25',
      llmMonthlyBudgetUsd: '3.5',
    },
    runtimeSettingsBaseline: createBaseline({
      fetchConcurrency: 5,
      runtimeScreencastFps: 12,
      scannedPdfOcrMinConfidence: 0.6,
      llmMonthlyBudgetUsd: 9.25,
    }),
  });

  assert.equal(parsed.parsedConcurrency, 5);
  assert.equal(parsed.parsedRuntimeScreencastFps, 7);
  assert.equal(parsed.parsedScannedPdfOcrMinConfidence, 0.25);
  assert.equal(parsed.parsedLlmMonthlyBudgetUsd, 3.5);
});

test('buildIndexingRunStartPayload composes and clamps cross-domain run payload fields', async () => {
  const { buildIndexingRunStartPayload } = await loadRunStartPayloadModule();

  const payload = buildIndexingRunStartPayload({
    requestedRunId: '  run-123  ',
    category: 'mouse',
    productId: 'mouse-v3-pro',
    runtimeSettingsPayload: createPayload({
      searchEngines: ' bing,brave,duckduckgo ',
      dynamicCrawleeEnabled: true,
      runtimeScreencastEnabled: true,
      importsRoot: '  ./imports  ',
      eventsJsonWrite: true,
      scannedPdfOcrEnabled: true,
      scannedPdfOcrBackend: '  tesseract  ',
      dynamicFetchPolicyMapJson: '  {"mouse":"full"}  ',
      discoveryEnabled: true,
      llmProvider: '  openai  ',
      llmPlanProvider: '  openai  ',
      llmPlanBaseUrl: '  https://plan.example.test  ',
      llmPlanApiKey: '  plan-key  ',
      llmVerifyMode: '  strict  ',
      llmModelPlan: '  gpt-plan  ',
      llmModelTriage: '  gpt-triage  ',
      llmMaxOutputTokensPlan: '128',
      llmMaxOutputTokensTriage: '130',
      llmModelReasoning: '  gpt-reasoning  ',
      llmMaxOutputTokensReasoning: '131',
      llmModelExtract: '  gpt-extract  ',
      llmMaxOutputTokensExtract: '132',
      llmModelValidate: '  gpt-validate  ',
      llmMaxOutputTokensValidate: '133',
      llmModelWrite: '  gpt-write  ',
      llmMaxOutputTokensWrite: '134',
      llmPlanFallbackModel: '  gpt-plan-fallback  ',
      llmMaxOutputTokensPlanFallback: '135',
      llmMaxOutputTokensExtractFallback: '136',
      llmMaxOutputTokensValidateFallback: '137',
      llmMaxOutputTokensWriteFallback: '138',
    }),
    parsedValues: createParsedValues({
      parsedConcurrency: 7,
      parsedRuntimeScreencastFps: 0,
      parsedRuntimeScreencastQuality: 5,
      parsedRuntimeScreencastMaxWidth: 100,
      parsedRuntimeScreencastMaxHeight: 100,
      parsedDaemonConcurrency: 0,
      parsedDaemonGracefulShutdownTimeoutMs: 200,
      parsedImportsPollSeconds: 0,
      parsedIdentityGatePublishThreshold: 1.5,
      parsedIndexingResumeSeedLimit: 0,
      parsedIndexingResumePersistLimit: 0,
      parsedScannedPdfOcrMaxPages: 0,
      parsedScannedPdfOcrMaxPairs: 0,
      parsedScannedPdfOcrMinChars: 0,
      parsedScannedPdfOcrMinLines: 0,
      parsedScannedPdfOcrMinConfidence: 1.5,
      parsedSearchProfileQueryCap: 0,
      parsedSearchPlannerQueryCap: 0,
      parsedMaxUrlsPerProduct: 0,
      parsedMaxCandidateUrls: 0,
      parsedMaxPagesPerDomain: 0,
      parsedMaxRunSeconds: 0,
      parsedMaxJsonBytes: 0,
      parsedMaxPdfBytes: 0,
      parsedLlmMaxCallsPerRound: 0,
      parsedLlmMaxOutputTokens: 50,
      parsedLlmVerifySampleRate: 0,
      parsedLlmMaxBatchesPerProduct: 0,
      parsedLlmMaxEvidenceChars: 0,
      parsedLlmMaxTokens: 0,
      parsedLlmTimeoutMs: 0,
      parsedLlmCostInputPer1M: -1,
      parsedLlmCostOutputPer1M: -1,
      parsedLlmCostCachedInputPer1M: -1,
      parsedEndpointSignalLimit: 0,
      parsedEndpointSuggestionLimit: 0,
      parsedEndpointNetworkScanLimit: 0,
      parsedMaxManufacturerUrlsPerProduct: 0,
      parsedMaxManufacturerPagesPerDomain: 0,
      parsedManufacturerReserveUrls: -1,
      parsedMaxHypothesisItems: 0,
      parsedHypothesisAutoFollowupRounds: -1,
      parsedHypothesisFollowupUrlsPerRound: 0,
      parsedLlmExtractionCacheTtlMs: 0,
      parsedLlmMaxCallsPerProductTotal: 0,
      parsedLlmMaxCallsPerProductFast: -1,
      // WHY: parsedNeedsetEvidenceDecayDays/Floor removed in Phase 12 NeedSet Legacy Removal
      parsedLlmExtractMaxTokens: 10,
      parsedLlmExtractMaxSnippetsPerBatch: 0,
      parsedLlmExtractMaxSnippetChars: 0,
      parsedLlmExtractReasoningBudget: 0,
      parsedLlmReasoningBudget: 0,
      parsedLlmMonthlyBudgetUsd: -1,
      parsedLlmPerProductBudgetUsd: -1,
    }),
    runControlPayload: {
      reviewMode: true,
    },
  });

  assert.equal(payload.requestedRunId, 'run-123');
  assert.equal(payload.mode, 'indexlab');
  assert.equal(payload.replaceRunning, true);
  assert.equal(payload.fetchConcurrency, 7);

  assert.equal(payload.runtimeScreencastFps, 1);
  assert.equal(payload.runtimeScreencastQuality, 10);
  assert.equal(payload.daemonConcurrency, 1);
  assert.equal(payload.importsRoot, './imports');

  assert.equal(payload.scannedPdfOcrBackend, 'tesseract');
  assert.equal(payload.scannedPdfOcrMaxPairs, 50);
  assert.equal(payload.scannedPdfOcrMinConfidence, 1);
  assert.equal(payload.dynamicFetchPolicyMapJson, '{"mouse":"full"}');

  assert.equal(payload.searchProfileQueryCap, 0);

  assert.equal(payload.llmProvider, 'openai');
  assert.equal(payload.llmPlanProvider, 'openai');
  assert.equal(payload.llmPlanApiKey, 'plan-key');
  assert.equal(payload.llmMaxOutputTokens, 256);
  assert.equal(payload.endpointNetworkScanLimit, 50);

  assert.equal(payload.searchEngines, 'bing,brave,duckduckgo');
  assert.equal(payload.llmModelPlan, 'gpt-plan');
  assert.equal(payload.llmMaxOutputTokensPlan, 128);
  assert.equal(payload.llmPlanFallbackModel, 'gpt-plan-fallback');

  assert.equal(payload.reviewMode, true);
});

// WHY: Retired stage-2 keys now flow through via the runtimeSettingsPayload spread.
// The payload no longer filters them out — the backend snapshot transport carries
// all settings, and the child ignores keys it doesn't recognize. This test now
// verifies the keys propagate correctly rather than being excluded.
test('buildIndexingRunStartPayload propagates all runtimeSettingsPayload keys via spread', async () => {
  const { buildIndexingRunStartPayload } = await loadRunStartPayloadModule();

  const payload = buildIndexingRunStartPayload({
    requestedRunId: 'run-spread-test',
    category: 'mouse',
    productId: 'mouse-acme-orbit-x1',
    runtimeSettingsPayload: createPayload({
      discoveryResultsPerQuery: '99',
      discoveryQueryConcurrency: '8',
      fetchBudgetMs: 30000,
    }),
    parsedValues: createParsedValues(),
    runControlPayload: {},
  });

  // WHY: These keys now flow through via the runtimeSettingsPayload spread
  assert.equal(payload.discoveryResultsPerQuery, '99');
  assert.equal(payload.discoveryQueryConcurrency, '8');
  assert.equal(payload.fetchBudgetMs, 30000);
});
