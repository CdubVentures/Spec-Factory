import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialProcessState,
  processStateReducer,
  deriveProcessStatus,
  normalizeRunIdToken,
  resolveProcessStorageDestination,
} from '../processLifecycleState.js';

// ═══════════════════════════════════════════════════════════════
// createInitialProcessState
// ═══════════════════════════════════════════════════════════════

test('createInitialProcessState returns idle phase with null snapshot', () => {
  const state = createInitialProcessState();
  assert.equal(state.phase, 'idle');
  assert.equal(state.relocatingRunId, null);
  assert.equal(state.snapshot.pid, null);
  assert.equal(state.snapshot.command, null);
  assert.equal(state.snapshot.startedAt, null);
  assert.equal(state.snapshot.runId, null);
  assert.equal(state.snapshot.category, null);
  assert.equal(state.snapshot.productId, null);
  assert.equal(state.snapshot.brand, null);
  assert.equal(state.snapshot.model, null);
  assert.equal(state.snapshot.variant, null);
  assert.equal(state.snapshot.storageDestination, null);
  assert.equal(state.snapshot.exitCode, null);
  assert.equal(state.snapshot.endedAt, null);
});

test('createInitialProcessState returns a fresh object each call', () => {
  const a = createInitialProcessState();
  const b = createInitialProcessState();
  assert.notEqual(a, b);
  assert.notEqual(a.snapshot, b.snapshot);
});

// ═══════════════════════════════════════════════════════════════
// processStateReducer — happy path transitions
// ═══════════════════════════════════════════════════════════════

const STARTED_PAYLOAD = {
  pid: 1234,
  command: 'node src/cli/spec.js indexlab',
  startedAt: '2026-03-20T10:00:00.000Z',
  runId: 'run_test1234',
  category: 'mouse',
  productId: 'mouse-razer-viper',
  brand: 'Razer',
  model: 'Viper V3 Pro',
  variant: 'White',
  storageDestination: 's3',
};

test('reducer PROCESS_STARTED from idle transitions to running with populated snapshot', () => {
  const state = createInitialProcessState();
  const next = processStateReducer(state, { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  assert.equal(next.phase, 'running');
  assert.equal(next.snapshot.pid, 1234);
  assert.equal(next.snapshot.command, 'node src/cli/spec.js indexlab');
  assert.equal(next.snapshot.runId, 'run_test1234');
  assert.equal(next.snapshot.category, 'mouse');
  assert.equal(next.snapshot.productId, 'mouse-razer-viper');
  assert.equal(next.snapshot.brand, 'Razer');
  assert.equal(next.snapshot.model, 'Viper V3 Pro');
  assert.equal(next.snapshot.variant, 'White');
  assert.equal(next.snapshot.storageDestination, 's3');
  assert.equal(next.snapshot.exitCode, null);
  assert.equal(next.snapshot.endedAt, null);
  assert.equal(next.relocatingRunId, null);
});

test('reducer PROCESS_EXITED from running transitions to exited with exitCode and endedAt', () => {
  const running = processStateReducer(createInitialProcessState(), { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  const next = processStateReducer(running, { type: 'PROCESS_EXITED', payload: { exitCode: 0, endedAt: '2026-03-20T10:05:00.000Z' } });
  assert.equal(next.phase, 'exited');
  assert.equal(next.snapshot.exitCode, 0);
  assert.equal(next.snapshot.endedAt, '2026-03-20T10:05:00.000Z');
  assert.equal(next.snapshot.pid, 1234);
  assert.equal(next.snapshot.runId, 'run_test1234');
});

test('reducer RELOCATION_STARTED from exited transitions to relocating', () => {
  let state = createInitialProcessState();
  state = processStateReducer(state, { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  state = processStateReducer(state, { type: 'PROCESS_EXITED', payload: { exitCode: 0, endedAt: '2026-03-20T10:05:00.000Z' } });
  const next = processStateReducer(state, { type: 'RELOCATION_STARTED', payload: { runId: 'run_test1234' } });
  assert.equal(next.phase, 'relocating');
  assert.equal(next.relocatingRunId, 'run_test1234');
});

test('reducer RELOCATION_COMPLETED from relocating transitions to idle', () => {
  let state = createInitialProcessState();
  state = processStateReducer(state, { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  state = processStateReducer(state, { type: 'PROCESS_EXITED', payload: { exitCode: 0, endedAt: '2026-03-20T10:05:00.000Z' } });
  state = processStateReducer(state, { type: 'RELOCATION_STARTED', payload: { runId: 'run_test1234' } });
  const next = processStateReducer(state, { type: 'RELOCATION_COMPLETED' });
  assert.equal(next.phase, 'idle');
  assert.equal(next.relocatingRunId, null);
  assert.equal(next.snapshot.exitCode, 0);
});

// ═══════════════════════════════════════════════════════════════
// processStateReducer — transition guards (illegal transitions)
// ═══════════════════════════════════════════════════════════════

test('reducer PROCESS_STARTED from running returns current state unchanged', () => {
  const running = processStateReducer(createInitialProcessState(), { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  const next = processStateReducer(running, { type: 'PROCESS_STARTED', payload: { ...STARTED_PAYLOAD, pid: 9999 } });
  assert.equal(next, running);
});

test('reducer PROCESS_EXITED from idle returns current state unchanged', () => {
  const idle = createInitialProcessState();
  const next = processStateReducer(idle, { type: 'PROCESS_EXITED', payload: { exitCode: 0, endedAt: '2026-03-20T10:05:00.000Z' } });
  assert.equal(next, idle);
});

test('reducer RELOCATION_STARTED from idle returns current state unchanged', () => {
  const idle = createInitialProcessState();
  const next = processStateReducer(idle, { type: 'RELOCATION_STARTED', payload: { runId: 'run_test1234' } });
  assert.equal(next, idle);
});

test('reducer RELOCATION_COMPLETED from running returns current state unchanged', () => {
  const running = processStateReducer(createInitialProcessState(), { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  const next = processStateReducer(running, { type: 'RELOCATION_COMPLETED' });
  assert.equal(next, running);
});

test('reducer unknown action type returns current state unchanged', () => {
  const state = createInitialProcessState();
  const next = processStateReducer(state, { type: 'INVALID_ACTION' });
  assert.equal(next, state);
});

test('reducer does not mutate the input state object', () => {
  const state = createInitialProcessState();
  const frozen = JSON.parse(JSON.stringify(state));
  processStateReducer(state, { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  assert.deepEqual(state, frozen);
});

// ═══════════════════════════════════════════════════════════════
// deriveProcessStatus
// ═══════════════════════════════════════════════════════════════

test('deriveProcessStatus from idle returns running:false with null fields', () => {
  const status = deriveProcessStatus(createInitialProcessState(), {});
  assert.equal(status.running, false);
  assert.equal(status.relocating, false);
  assert.equal(status.relocatingRunId, null);
  assert.equal(status.run_id, null);
  assert.equal(status.runId, null);
  assert.equal(status.pid, null);
  assert.equal(status.command, null);
  assert.equal(status.exitCode, null);
  assert.equal(status.endedAt, null);
});

test('deriveProcessStatus from running returns running:true with snapshot fields', () => {
  const running = processStateReducer(createInitialProcessState(), { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  const status = deriveProcessStatus(running, {});
  assert.equal(status.running, true);
  assert.equal(status.relocating, false);
  assert.equal(status.pid, 1234);
  assert.equal(status.runId, 'run_test1234');
  assert.equal(status.category, 'mouse');
  assert.equal(status.brand, 'Razer');
  assert.equal(status.exitCode, null);
  assert.equal(status.endedAt, null);
});

test('deriveProcessStatus from exited returns exitCode and endedAt', () => {
  let state = createInitialProcessState();
  state = processStateReducer(state, { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  state = processStateReducer(state, { type: 'PROCESS_EXITED', payload: { exitCode: 1, endedAt: '2026-03-20T10:05:00.000Z' } });
  const status = deriveProcessStatus(state, {});
  assert.equal(status.running, false);
  assert.equal(status.exitCode, 1);
  assert.equal(status.endedAt, '2026-03-20T10:05:00.000Z');
});

test('deriveProcessStatus from relocating returns relocating:true with relocatingRunId', () => {
  let state = createInitialProcessState();
  state = processStateReducer(state, { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  state = processStateReducer(state, { type: 'PROCESS_EXITED', payload: { exitCode: 0, endedAt: '2026-03-20T10:05:00.000Z' } });
  state = processStateReducer(state, { type: 'RELOCATION_STARTED', payload: { runId: 'run_test1234' } });
  const status = deriveProcessStatus(state, {});
  assert.equal(status.running, false);
  assert.equal(status.relocating, true);
  assert.equal(status.relocatingRunId, 'run_test1234');
});

test('deriveProcessStatus dual-key fields are equal', () => {
  const running = processStateReducer(createInitialProcessState(), { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  const status = deriveProcessStatus(running, {});
  assert.equal(status.run_id, status.runId);
  assert.equal(status.product_id, status.productId);
  assert.equal(status.storage_destination, status.storageDestination);
});

test('deriveProcessStatus falls back to runDataStorageState for storageDestination', () => {
  const started = processStateReducer(createInitialProcessState(), {
    type: 'PROCESS_STARTED',
    payload: { ...STARTED_PAYLOAD, storageDestination: null },
  });
  const status = deriveProcessStatus(started, { runDataStorageState: { enabled: true, destinationType: 's3' } });
  assert.equal(status.storageDestination, 's3');
  assert.equal(status.storage_destination, 's3');
});

test('deriveProcessStatus defaults storageDestination to local when no source', () => {
  const started = processStateReducer(createInitialProcessState(), {
    type: 'PROCESS_STARTED',
    payload: { ...STARTED_PAYLOAD, storageDestination: null },
  });
  const status = deriveProcessStatus(started, {});
  assert.equal(status.storageDestination, 'local');
});

test('deriveProcessStatus nulls exitCode and endedAt when phase is running', () => {
  const running = processStateReducer(createInitialProcessState(), { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD });
  const status = deriveProcessStatus(running, {});
  assert.equal(status.exitCode, null);
  assert.equal(status.endedAt, null);
});

// ═══════════════════════════════════════════════════════════════
// normalizeRunIdToken
// ═══════════════════════════════════════════════════════════════

test('normalizeRunIdToken passes through valid tokens', () => {
  assert.equal(normalizeRunIdToken('run_test1234'), 'run_test1234');
  assert.equal(normalizeRunIdToken('20260320-abcd1234'), '20260320-abcd1234');
});

test('normalizeRunIdToken returns empty for null/undefined/empty', () => {
  assert.equal(normalizeRunIdToken(null), '');
  assert.equal(normalizeRunIdToken(undefined), '');
  assert.equal(normalizeRunIdToken(''), '');
});

test('normalizeRunIdToken returns empty for tokens shorter than 8 chars', () => {
  assert.equal(normalizeRunIdToken('short'), '');
  assert.equal(normalizeRunIdToken('1234567'), '');
});

test('normalizeRunIdToken returns empty for tokens longer than 96 chars', () => {
  assert.equal(normalizeRunIdToken('a'.repeat(97)), '');
});

test('normalizeRunIdToken returns empty for tokens with illegal characters', () => {
  assert.equal(normalizeRunIdToken('run id spaces'), '');
  assert.equal(normalizeRunIdToken('run@special!'), '');
});

// ═══════════════════════════════════════════════════════════════
// resolveProcessStorageDestination
// ═══════════════════════════════════════════════════════════════

test('resolveProcessStorageDestination returns local for non-object input', () => {
  assert.equal(resolveProcessStorageDestination(null), 'local');
  assert.equal(resolveProcessStorageDestination(undefined), 'local');
  assert.equal(resolveProcessStorageDestination('string'), 'local');
});

test('resolveProcessStorageDestination returns local when not enabled', () => {
  assert.equal(resolveProcessStorageDestination({ enabled: false }), 'local');
  assert.equal(resolveProcessStorageDestination({}), 'local');
});

test('resolveProcessStorageDestination returns s3 when enabled with s3 destination', () => {
  assert.equal(resolveProcessStorageDestination({ enabled: true, destinationType: 's3' }), 's3');
});

test('resolveProcessStorageDestination returns local when enabled with local destination', () => {
  assert.equal(resolveProcessStorageDestination({ enabled: true, destinationType: 'local' }), 'local');
});
