import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { IndexLabRuntimeBridge } from '../../../../../../indexlab/runtimeBridge.js';

export async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-int-'));
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: tmpDir,
    onEvent: (ev) => events.push(ev),
    ...overrides
  });
  return { bridge, events, tmpDir };
}

export function baseRow(overrides = {}) {
  return {
    runId: 'run-int-001',
    event: 'run_started',
    ts: '2025-01-01T00:00:00Z',
    category: 'mouse',
    productId: 'mouse-test-01',
    ...overrides
  };
}

export async function startRun(bridge) {
  bridge.onRuntimeEvent(baseRow());
  await bridge.queue;
}

export async function emitSearchAttempt(
  bridge,
  {
    startTs,
    finishTs,
    query,
    provider = 'google',
    resultCount,
    durationMs,
  },
) {
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: startTs,
    query,
    provider,
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: finishTs,
    query,
    provider,
    result_count: resultCount,
    duration_ms: durationMs,
  }));
  await bridge.queue;
}

export async function emitLlmCall(
  bridge,
  {
    startTs,
    finishTs,
    batchId,
    reason,
    model,
    provider = 'openai',
    round = 1,
    promptTokens = null,
    completionTokens = null,
    estimatedCost = null,
    durationMs = null,
    inputSummary = null,
    outputSummary = null,
    promptPreview = '',
    responsePreview = '',
    fail = false,
    failMessage = ''
  },
) {
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: startTs,
    batch_id: batchId,
    reason,
    model,
    provider,
    round,
    prompt_tokens: promptTokens,
    input_summary: inputSummary,
    prompt_preview: promptPreview
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: fail ? 'llm_call_failed' : 'llm_call_completed',
    ts: finishTs,
    batch_id: batchId,
    reason,
    model,
    provider,
    round,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    estimated_cost: estimatedCost,
    duration_ms: durationMs,
    output_summary: outputSummary,
    response_preview: responsePreview,
    message: failMessage
  }));
  await bridge.queue;
}

export function findWorker(workers, id) {
  return workers.find((worker) => worker.worker_id === id);
}

export function workersByPool(workers, pool) {
  return workers.filter((worker) => worker.pool === pool);
}
