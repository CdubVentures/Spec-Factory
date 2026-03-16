import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRunLoggerBootstrap,
  buildRunBootstrapLogPayload,
} from '../src/features/indexing/orchestration/index.js';

test('createRunLoggerBootstrap wires EventLogger options and deterministic start timestamp', () => {
  const createdOptions = [];
  const loggerMarker = { info() {} };
  const result = createRunLoggerBootstrap({
    storage: { marker: 'storage' },
    config: {
      runtimeEventsKey: '_runtime/custom-events.jsonl',
      onRuntimeEvent: () => {},
    },
    runId: 'run.abc123',
    nowFn: () => 1234567890,
    createEventLoggerFn: (options) => {
      createdOptions.push(options);
      return loggerMarker;
    },
  });

  assert.equal(createdOptions.length, 1);
  assert.equal(createdOptions[0].runtimeEventsKey, '_runtime/custom-events.jsonl');
  assert.equal(createdOptions[0].storage.marker, 'storage');
  assert.equal(typeof createdOptions[0].onEvent, 'function');
  assert.deepEqual(createdOptions[0].context, { runId: 'run.abc123' });
  assert.equal(result.logger, loggerMarker);
  assert.equal(result.startMs, 1234567890);
});

test('buildRunBootstrapLogPayload builds stable run_started and run_context payloads', () => {
  const payloads = buildRunBootstrapLogPayload({
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    roundContext: { round: 2 },
    category: 'mouse',
    productId: 'mouse-sample',
    config: { runProfile: 'thorough' },
    runtimeMode: 'fast',
    identityFingerprint: 'identity-fingerprint-123',
    identityLockStatus: 'locked',
    identityLock: {
      family_model_count: 4,
      ambiguity_level: 'high',
    },
    dedupeMode: 'serp_url+content_hash',
  });

  assert.deepEqual(payloads.runStartedPayload, {
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    round: 2,
  });
  assert.deepEqual(payloads.loggerContext, {
    category: 'mouse',
    productId: 'mouse-sample',
  });
  assert.equal(payloads.runContextPayload.run_profile, 'standard');
  assert.equal(payloads.runContextPayload.runtime_mode, 'fast');
  assert.equal(payloads.runContextPayload.identity_fingerprint, 'identity-fingerprint-123');
  assert.equal(payloads.runContextPayload.identity_lock_status, 'locked');
  assert.equal(payloads.runContextPayload.family_model_count, 4);
  assert.equal(payloads.runContextPayload.ambiguity_level, 'high');
  assert.equal(payloads.runContextPayload.dedupe_mode, 'serp_url+content_hash');
  assert.equal(payloads.runContextPayload.phase_cursor, 'phase_00_bootstrap');
});
