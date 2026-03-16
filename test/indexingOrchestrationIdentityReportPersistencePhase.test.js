import test from 'node:test';
import assert from 'node:assert/strict';
import { runIdentityReportPersistencePhase } from '../src/features/indexing/orchestration/index.js';

test('runIdentityReportPersistencePhase stamps identity_report key and persists identity report JSON', async () => {
  const writes = [];
  const summary = {
    identity_report: {
      status: 'computed',
    },
  };
  const identityReport = {
    score: 0.93,
  };
  const storage = {
    async writeObject(key, buffer, meta) {
      writes.push({ key, buffer, meta });
    },
  };

  const identityReportKey = await runIdentityReportPersistencePhase({
    storage,
    runBase: 'runs/r1',
    summary,
    identityReport,
  });

  assert.equal(identityReportKey, 'runs/r1/identity_report.json');
  assert.deepEqual(summary.identity_report, {
    status: 'computed',
    key: 'runs/r1/identity_report.json',
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, 'runs/r1/identity_report.json');
  assert.equal(writes[0].buffer.toString('utf8'), JSON.stringify(identityReport, null, 2));
  assert.deepEqual(writes[0].meta, { contentType: 'application/json' });
});
