import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityReportPersistenceContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityReportPersistenceContext maps runProduct identity-report inputs to phase contract keys', () => {
  const storage = { id: 'storage' };
  const summary = { validated: true };
  const identityReport = { score: 0.92 };

  const context = buildIdentityReportPersistenceContext({
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
