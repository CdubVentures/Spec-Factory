import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveOperationStreamingPolicy,
  shouldEmitOperationStream,
} from '../operationStreamingPolicy.js';

test('resolveOperationStreamingPolicy uses adaptive industry-standard defaults', () => {
  const policy = resolveOperationStreamingPolicy({});

  assert.deepStrictEqual(policy, {
    mode: 'adaptive',
    maxActiveOps: 10,
    flushMs: 250,
  });
});

test('resolveOperationStreamingPolicy reads flat LLM config keys', () => {
  const policy = resolveOperationStreamingPolicy({
    llmOperationStreamingMode: 'always',
    llmOperationStreamingMaxActiveOps: 20,
    llmOperationStreamingFlushMs: 500,
  });

  assert.deepStrictEqual(policy, {
    mode: 'always',
    maxActiveOps: 20,
    flushMs: 500,
  });
});

test('resolveOperationStreamingPolicy falls back to adaptive for invalid mode', () => {
  const policy = resolveOperationStreamingPolicy({
    llmOperationStreamingMode: 'sometimes',
  });

  assert.equal(policy.mode, 'adaptive');
});

test('shouldEmitOperationStream keeps always mode enabled regardless of load', () => {
  assert.equal(
    shouldEmitOperationStream({
      policy: { mode: 'always', maxActiveOps: 10, flushMs: 250 },
      activeOperationCount: 99,
    }),
    true,
  );
});

test('shouldEmitOperationStream disables off mode regardless of load', () => {
  assert.equal(
    shouldEmitOperationStream({
      policy: { mode: 'off', maxActiveOps: 10, flushMs: 250 },
      activeOperationCount: 0,
    }),
    false,
  );
});

test('shouldEmitOperationStream allows adaptive mode at threshold', () => {
  assert.equal(
    shouldEmitOperationStream({
      policy: { mode: 'adaptive', maxActiveOps: 10, flushMs: 250 },
      activeOperationCount: 10,
    }),
    true,
  );
});

test('shouldEmitOperationStream suppresses adaptive mode above threshold', () => {
  assert.equal(
    shouldEmitOperationStream({
      policy: { mode: 'adaptive', maxActiveOps: 10, flushMs: 250 },
      activeOperationCount: 11,
    }),
    false,
  );
});
