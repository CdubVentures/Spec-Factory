import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunLlmRuntime } from '../src/features/indexing/orchestration/bootstrap/createRunLlmRuntime.js';

test('createRunLlmRuntime initializes verification state, budget guard, and merged forced-high fields', () => {
  const startRoundCalls = [];
  const budgetGuard = {
    startRound() {
      startRoundCalls.push('start');
    },
  };

  const runtime = createRunLlmRuntime({
    storage: { id: 'storage' },
    config: {
      llmVerifyMode: true,
      llmVerifySampleRate: 10,
    },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run-123',
    roundContext: {
      round: 2,
      force_verify_llm: true,
      escalated_fields: ['weight_g', 'dpi'],
    },
    runtimeMode: 'production',
    traceWriter: { id: 'trace' },
    routeMatrixPolicy: { route: 'matrix' },
    runtimeOverrides: {
      force_high_fields: ['dpi', 'sensor'],
    },
    billingSnapshot: {
      monthly_cost_usd: 12.5,
    },
    stableHashFn: () => 3,
    buildInitialLlmBudgetStateFn: (snapshot) => ({
      monthlySpentUsd: snapshot.monthly_cost_usd,
      productSpentUsd: 0,
      productCallsTotal: 0,
    }),
    createBudgetGuardFn: (state) => {
      assert.equal(state.monthlySpentUsd, 12.5);
      return budgetGuard;
    },
    normalizeCostRatesFn: () => ({ extract: 0.42 }),
  });

  assert.deepEqual(startRoundCalls, ['start']);
  assert.equal(runtime.llmBudgetGuard, budgetGuard);
  assert.deepEqual(runtime.llmCostRates, { extract: 0.42 });
  assert.equal(runtime.llmContext.round, 2);
  assert.equal(runtime.llmContext.mode, 'production');
  assert.deepEqual(runtime.llmContext.verification, {
    enabled: true,
    done: false,
    trigger: 'missing_required_fields',
  });
  assert.deepEqual(runtime.llmContext.forcedHighFields, ['dpi', 'sensor', 'weight_g']);
  assert.equal(runtime.llmContext.route_matrix_policy.route, 'matrix');
  assert.equal(runtime.llmContext.routeMatrixPolicy.route, 'matrix');
});

test('createRunLlmRuntime records usage counters, billing entries, and prompt index writes', async () => {
  const ledgerEntries = [];
  const promptResults = [];
  const mkdirCalls = [];

  const runtime = createRunLlmRuntime({
    storage: { id: 'storage' },
    config: {
      llmVerifyMode: false,
    },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run-123',
    roundContext: {
      round: 0,
      escalated_fields: [],
    },
    runtimeMode: 'production',
    traceWriter: null,
    routeMatrixPolicy: {},
    runtimeOverrides: {},
    billingSnapshot: {},
    stableHashFn: () => 0,
    buildInitialLlmBudgetStateFn: () => ({
      monthlySpentUsd: 0,
      productSpentUsd: 0,
      productCallsTotal: 0,
    }),
    createBudgetGuardFn: () => ({
      startRound() {},
    }),
    normalizeCostRatesFn: () => ({ extract: 0.2 }),
    appendCostLedgerEntryFn: async (payload) => {
      ledgerEntries.push(payload);
    },
    defaultIndexLabRootFn: () => 'C:/idx-root',
    joinPathFn: (...parts) => parts.join('/'),
    mkdirSyncFn: (dirPath, options) => {
      mkdirCalls.push({ dirPath, options });
    },
    recordPromptResultFn: (payload, filePath) => {
      promptResults.push({ payload, filePath });
    },
    nowIsoFn: () => '2026-03-11T12:00:00.000Z',
  });

  await runtime.llmContext.recordUsage({
    provider: 'openai',
    model: 'gpt-test',
    round: 3,
    prompt_tokens: 100,
    completion_tokens: 50,
    cached_prompt_tokens: 10,
    total_tokens: 160,
    cost_usd: 1.25,
    reason: 'extract',
    host: 'example.com',
    url_count: 2,
    evidence_chars: 400,
    estimated_usage: true,
    retry_without_schema: true,
    deepseek_mode_detected: false,
    json_schema_requested: true,
  });

  assert.deepEqual(runtime.getUsageState(), {
    llmCallCount: 1,
    llmCostUsd: 1.25,
    llmEstimatedUsageCount: 1,
    llmRetryWithoutSchemaCount: 1,
  });
  assert.deepEqual(ledgerEntries, [
    {
      storage: { id: 'storage' },
      config: { llmVerifyMode: false },
      entry: {
        ts: '2026-03-11T12:00:00.000Z',
        provider: 'openai',
        model: 'gpt-test',
        category: 'mouse',
        productId: 'mouse-product',
        runId: 'run-123',
        round: 3,
        prompt_tokens: 100,
        completion_tokens: 50,
        cached_prompt_tokens: 10,
        total_tokens: 160,
        cost_usd: 1.25,
        reason: 'extract',
        host: 'example.com',
        url_count: 2,
        evidence_chars: 400,
        estimated_usage: true,
        meta: {
          retry_without_schema: true,
          deepseek_mode_detected: false,
          json_schema_requested: true,
        },
      },
    },
  ]);
  assert.deepEqual(mkdirCalls, [
    {
      dirPath: 'C:/idx-root/mouse',
      options: { recursive: true },
    },
  ]);
  assert.deepEqual(promptResults, [
    {
      payload: {
        prompt_version: 'extract',
        prompt_hash: '',
        model: 'gpt-test',
        field_count: 0,
        token_count: 160,
        latency_ms: 0,
        success: true,
        run_id: 'run-123',
        category: 'mouse',
      },
      filePath: 'C:/idx-root/mouse/prompt-index.ndjson',
    },
  ]);
});
