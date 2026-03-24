import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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
      runtimeScreencastFps: '7',
      llmMonthlyBudgetUsd: '3.5',
    },
    runtimeSettingsBaseline: createBaseline({
      runtimeScreencastFps: 12,
      llmMonthlyBudgetUsd: 9.25,
    }),
  });

  assert.equal(parsed.parsedRuntimeScreencastFps, 7);
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
      runtimeScreencastEnabled: true,
      eventsJsonWrite: true,
      discoveryEnabled: true,
      llmProvider: '  openai  ',
      llmPlanProvider: '  openai  ',
      llmPlanBaseUrl: '  https://plan.example.test  ',
      llmPlanApiKey: '  plan-key  ',
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
      parsedRuntimeScreencastFps: 0,
      parsedRuntimeScreencastQuality: 5,
      parsedRuntimeScreencastMaxWidth: 100,
      parsedRuntimeScreencastMaxHeight: 100,
      parsedIdentityGatePublishThreshold: 1.5,
      parsedIndexingResumeSeedLimit: 0,
      parsedIndexingResumePersistLimit: 0,
      parsedSearchProfileQueryCap: 0,
      parsedSearchPlannerQueryCap: 0,
      parsedMaxUrlsPerProduct: 0,
      parsedMaxCandidateUrls: 0,
      parsedMaxPagesPerDomain: 0,
      parsedMaxRunSeconds: 0,
      parsedLlmMaxCallsPerRound: 0,
      parsedLlmMaxOutputTokens: 50,
      parsedLlmMaxTokens: 0,
      parsedLlmTimeoutMs: 0,
      parsedLlmCostInputPer1M: -1,
      parsedLlmCostOutputPer1M: -1,
      parsedLlmCostCachedInputPer1M: -1,
      parsedMaxManufacturerUrlsPerProduct: 0,
      parsedMaxManufacturerPagesPerDomain: 0,
      parsedManufacturerReserveUrls: -1,
      parsedLlmMaxCallsPerProductTotal: 0,
      parsedLlmMaxCallsPerProductFast: -1,
      // WHY: parsedNeedsetEvidenceDecayDays/Floor removed in Phase 12 NeedSet Legacy Removal
      parsedLlmExtractMaxTokens: 10,
      parsedLlmReasoningBudget: 0,
      parsedLlmMonthlyBudgetUsd: -1,
      parsedLlmPerProductBudgetUsd: -1,
      // WHY: Model token fields now handled by generic overlay (no sub-builder).
      // In the real flow, deriveIndexingRunStartParsedValues generates these.
      parsedLlmMaxOutputTokensPlan: 128,
      parsedLlmMaxOutputTokensReasoning: 131,
      parsedLlmMaxOutputTokensPlanFallback: 135,
      parsedLlmMaxOutputTokensReasoningFallback: 138,
      parsedLlmMaxOutputTokensExtractFallback: 136,
      parsedLlmMaxOutputTokensValidateFallback: 137,
      parsedLlmMaxOutputTokensWriteFallback: 138,
    }),
    runControlPayload: {
      reviewMode: true,
    },
  });

  assert.equal(payload.requestedRunId, 'run-123');
  assert.equal(payload.mode, 'indexlab');
  assert.equal(payload.replaceRunning, true);

  assert.equal(payload.runtimeScreencastFps, 1);
  assert.equal(payload.runtimeScreencastQuality, 10);

  // WHY: Registry SSOT defines min: 1 for searchProfileQueryCap. The generic
  // overlay now enforces registry min consistently. Old discovery builder skipped
  // clamping, but the registry is the source of truth.
  assert.equal(payload.searchProfileQueryCap, 1);

  assert.equal(payload.llmProvider, 'openai');
  assert.equal(payload.llmPlanProvider, 'openai');
  assert.equal(payload.llmPlanApiKey, 'plan-key');
  assert.equal(payload.llmMaxOutputTokens, 256);
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
      perHostMinDelayMs: 1500,
    }),
    parsedValues: createParsedValues(),
    runControlPayload: {},
  });

  // WHY: These keys now flow through via the runtimeSettingsPayload spread
  assert.equal(payload.perHostMinDelayMs, 1500);
});
