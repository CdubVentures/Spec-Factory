import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../runtimeOpsDataBuilders.js';
import {
  emitLlmCall,
  makeBridge,
  startRun,
  workersByPool
} from './fixtures/runtimeOpsWorkerPipelineHarness.js';

test('integration: LLM bridge telemetry surfaces on worker rows and worker detail', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  await emitLlmCall(bridge, {
    startTs: '2025-01-01T00:00:30Z',
    finishTs: '2025-01-01T00:00:33Z',
    batchId: 'br-2',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    promptTokens: 200,
    completionTokens: 60,
    estimatedCost: 0.005,
    durationMs: 2500,
    inputSummary: 'Resolve brand',
    outputSummary: 'Resolved brand',
    promptPreview: 'prompt text here',
    responsePreview: 'response text here'
  });

  const workers = buildRuntimeOpsWorkers(events);
  const llmWorker = workersByPool(workers, 'llm')[0];
  const detail = buildWorkerDetail(events, llmWorker.worker_id);

  assert.ok(llmWorker, 'LLM worker exists');
  assert.equal(llmWorker.call_type, 'brand_resolver');
  assert.equal(llmWorker.model, 'gpt-4o');
  assert.equal(llmWorker.prompt_tokens, 200);
  assert.equal(llmWorker.completion_tokens, 60);
  assert.equal(llmWorker.estimated_cost, 0.005);
  assert.ok(llmWorker.prefetch_tab != null, 'has prefetch_tab');

  assert.ok(detail.llm_detail, 'has llm_detail');
  assert.equal(detail.llm_detail.call_type, 'brand_resolver');
  assert.equal(detail.llm_detail.model, 'gpt-4o');
  assert.equal(detail.llm_detail.round, 1);
  assert.equal(detail.llm_detail.prompt_tokens, 200);
  assert.equal(detail.llm_detail.completion_tokens, 60);
  assert.equal(detail.llm_detail.estimated_cost, 0.005);
  assert.deepEqual(detail.documents, [], 'documents empty for LLM');
});

test('integration: LLM aggregate state tracks calls by type and model', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  await emitLlmCall(bridge, {
    startTs: '2025-01-01T00:00:30Z',
    finishTs: '2025-01-01T00:00:32Z',
    batchId: 'c1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    promptTokens: 100,
    completionTokens: 40,
    estimatedCost: 0.003
  });

  await emitLlmCall(bridge, {
    startTs: '2025-01-01T00:00:33Z',
    finishTs: '2025-01-01T00:00:35Z',
    batchId: 'c2',
    reason: 'discovery_planner_primary',
    model: 'gpt-4o',
    promptTokens: 200,
    completionTokens: 80,
    estimatedCost: 0.005
  });

  await emitLlmCall(bridge, {
    startTs: '2025-01-01T00:00:36Z',
    finishTs: '2025-01-01T00:00:38Z',
    batchId: 'c3',
    reason: 'extract_fields',
    model: 'claude-sonnet',
    promptTokens: 150,
    fail: true,
    failMessage: 'timeout'
  });

  const agg = bridge._llmAgg;
  assert.equal(agg.total_calls, 3, '3 total calls');
  assert.equal(agg.completed_calls, 3, '3 completed (includes failed)');
  assert.equal(agg.failed_calls, 1, '1 failed');
  assert.equal(agg.active_calls, 0, '0 active');
  assert.ok(agg.calls_by_type.brand_resolver >= 1, 'brand_resolver tracked');
  assert.ok(agg.calls_by_type.search_planner >= 1, 'search_planner tracked');
  assert.ok(agg.calls_by_type.extraction >= 1, 'extraction tracked');
  assert.ok(agg.calls_by_model['gpt-4o'] >= 2, 'gpt-4o model tracked');
  assert.ok(agg.calls_by_model['claude-sonnet'] >= 1, 'claude-sonnet model tracked');
});
