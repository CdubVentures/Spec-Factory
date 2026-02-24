import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRunActiveScope } from '../tools/gui-react/src/pages/runtime-ops/runActivityScopeHelpers.js';

test('resolveRunActiveScope prefers selected run status when known', () => {
  assert.equal(
    resolveRunActiveScope({ processRunning: false, selectedRunStatus: 'running' }),
    true
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: true, selectedRunStatus: 'completed' }),
    false
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: true, selectedRunStatus: 'failed' }),
    false
  );
});

test('resolveRunActiveScope falls back to process state when selected run status is unknown', () => {
  assert.equal(
    resolveRunActiveScope({ processRunning: true, selectedRunStatus: '' }),
    true
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: false, selectedRunStatus: null }),
    false
  );
});
