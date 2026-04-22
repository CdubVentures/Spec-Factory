// WHY: buildOperationTelemetry is the canonical callback bundle every finder
// route spreads into its orchestrator opts. Kills the ~30 LOC of duplicated
// wiring that lived in finderRoutes / keyFinderRoutes / colorEditionFinderRoutes.
// These tests lock the contract so future route migrations can trust the shape.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationTelemetry } from '../buildOperationTelemetry.js';
import {
  _resetForTest,
  initOperationsRegistry,
  registerOperation,
  setStatus,
  listOperations,
} from '../operationsRegistry.js';

function readOp(id) {
  return listOperations().find((o) => o.id === id);
}

function makeBatcherStub() {
  const pushed = [];
  return {
    pushed,
    push: (chunk) => pushed.push(chunk),
  };
}

function setupRunningOp() {
  const broadcasts = [];
  _resetForTest();
  initOperationsRegistry({ broadcastWs: (channel, data) => broadcasts.push({ channel, data }) });
  const op = registerOperation({
    type: 'kf', subType: '', category: 'mouse', productId: 'p1',
    productLabel: 'Test', fieldKey: 'polling_rate',
    stages: ['Discovery', 'Validate', 'Publish'], status: 'queued',
  });
  setStatus({ id: op.id, status: 'running' });
  return { op, broadcasts };
}

test('buildOperationTelemetry (run mode) exposes the six core callbacks', () => {
  const { op } = setupRunningOp();
  const batcher = makeBatcherStub();
  const telemetry = buildOperationTelemetry({ op, batcher, mode: 'run' });

  for (const key of [
    'onStageAdvance', 'onModelResolved', 'onStreamChunk',
    'onQueueWait', 'onLlmCallComplete', 'onPassengersRegistered',
  ]) {
    assert.equal(typeof telemetry[key], 'function', `${key} must be wired`);
  }
  assert.equal(telemetry.onLoopProgress, undefined,
    'run mode must NOT include onLoopProgress — only loop mode needs it');
});

test('buildOperationTelemetry (loop mode) adds onLoopProgress', () => {
  const { op } = setupRunningOp();
  const batcher = makeBatcherStub();
  const telemetry = buildOperationTelemetry({ op, batcher, mode: 'loop' });
  assert.equal(typeof telemetry.onLoopProgress, 'function', 'loop mode must include onLoopProgress');
});

test('onStageAdvance maps to updateStage → op.currentStageIndex', () => {
  const { op } = setupRunningOp();
  const telemetry = buildOperationTelemetry({ op, batcher: makeBatcherStub() });

  telemetry.onStageAdvance('Validate');
  const stored = readOp(op.id);
  assert.equal(stored.currentStageIndex, 1, 'Validate is stages[1]');
});

test('onModelResolved maps to updateModelInfo → op.modelInfo', () => {
  const { op } = setupRunningOp();
  const telemetry = buildOperationTelemetry({ op, batcher: makeBatcherStub() });

  telemetry.onModelResolved({ model: 'gpt-5.4', provider: 'openai', thinking: true, webSearch: true });
  const stored = readOp(op.id);
  assert.equal(stored.modelInfo?.model, 'gpt-5.4');
  assert.equal(stored.modelInfo?.thinking, true);
});

test('onStreamChunk forwards reasoning + content into the batcher', () => {
  const { op } = setupRunningOp();
  const batcher = makeBatcherStub();
  const telemetry = buildOperationTelemetry({ op, batcher });

  telemetry.onStreamChunk({ reasoning: 'think...', content: 'answer' });
  assert.deepEqual(batcher.pushed, ['think...', 'answer'],
    'reasoning tokens arrive first, then content — preserves the stream order the modal renders');

  telemetry.onStreamChunk({ content: 'more' });
  assert.deepEqual(batcher.pushed, ['think...', 'answer', 'more']);
});

test('onStreamChunk tolerates partial/empty deltas without throwing', () => {
  const { op } = setupRunningOp();
  const batcher = makeBatcherStub();
  const telemetry = buildOperationTelemetry({ op, batcher });

  telemetry.onStreamChunk(null);
  telemetry.onStreamChunk(undefined);
  telemetry.onStreamChunk({});
  telemetry.onStreamChunk({ reasoning: '' });
  assert.deepEqual(batcher.pushed, [],
    'empty-string reasoning/content must NOT be pushed — avoids flooding the modal with noise');
});

test('onQueueWait maps to updateQueueDelay → op.queueDelayMs', () => {
  const { op } = setupRunningOp();
  const telemetry = buildOperationTelemetry({ op, batcher: makeBatcherStub() });

  telemetry.onQueueWait(1250);
  const stored = readOp(op.id);
  assert.equal(stored.queueDelayMs, 1250);
});

test('onLlmCallComplete maps to appendLlmCall → op.llmCalls', () => {
  const { op } = setupRunningOp();
  const telemetry = buildOperationTelemetry({ op, batcher: makeBatcherStub() });

  telemetry.onLlmCallComplete({
    label: 'Discovery',
    prompt: { system: 'sys', user: 'usr' },
    response: null,
    model: 'gpt-5.4',
  });
  const stored = readOp(op.id);
  assert.equal(stored.llmCalls.length, 1);
  assert.equal(stored.llmCalls[0].label, 'Discovery');
  assert.equal(stored.llmCalls[0].response, null, 'pending shape preserved');
});

test('onPassengersRegistered maps to markPassengersRegistered', () => {
  const { op } = setupRunningOp();
  const telemetry = buildOperationTelemetry({ op, batcher: makeBatcherStub() });

  telemetry.onPassengersRegistered(['dpi', 'buttons']);
  const stored = readOp(op.id);
  assert.equal(stored.passengersRegistered, true);
  assert.deepEqual(stored.passengerFieldKeys, ['dpi', 'buttons']);
});

test('onLoopProgress (loop mode) maps to updateLoopProgress → op.loopProgress', () => {
  const { op } = setupRunningOp();
  const telemetry = buildOperationTelemetry({ op, batcher: makeBatcherStub(), mode: 'loop' });

  const payload = {
    publish: { count: 0, target: 1, satisfied: false, confidence: null },
    callBudget: { used: 2, budget: 5, exhausted: false },
    final_status: null,
    loop_id: 'loop-abc',
  };
  telemetry.onLoopProgress(payload);
  const stored = readOp(op.id);
  assert.deepEqual(stored.loopProgress, payload,
    'loopProgress is stored as-is — shape is finder-defined, not enforced by the registry');
});
