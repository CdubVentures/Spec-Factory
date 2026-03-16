import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityReportPersistencePhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityReportPersistencePhaseCallsiteContext maps runProduct identity-report persistence callsite inputs to context keys', () => {
  const storage = { id: 'storage' };
  const summary = { validated: true };
  const identityReport = { score: 0.92 };

  const context = buildIdentityReportPersistencePhaseCallsiteContext({
    storage,
    runBase: 'runs/r1',
    summary,
    identityReport,
  });

  assert.equal(context.storage, storage);
  assert.equal(context.runBase, 'runs/r1');
  assert.equal(context.summary, summary);
  assert.equal(context.identityReport, identityReport);
});
