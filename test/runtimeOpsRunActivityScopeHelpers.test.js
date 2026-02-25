import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRunActiveScope } from '../tools/gui-react/src/pages/runtime-ops/runActivityScopeHelpers.js';

test('resolveRunActiveScope stays active while process is running', () => {
  assert.equal(
    resolveRunActiveScope({ processRunning: false, selectedRunStatus: 'running' }),
    true
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: true, selectedRunStatus: 'completed' }),
    true
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: true, selectedRunStatus: 'failed' }),
    true
  );
});

test('resolveRunActiveScope falls back to selected run status when process is not running', () => {
  assert.equal(
    resolveRunActiveScope({ processRunning: true, selectedRunStatus: '' }),
    true
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: false, selectedRunStatus: null }),
    false
  );
  assert.equal(
    resolveRunActiveScope({ processRunning: false, selectedRunStatus: 'completed' }),
    false
  );
});
