import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

test('upsertRunArtifact + getRunArtifact roundtrip — object payload serialized and parsed', () => {
  const { specDb } = createHarness();

  specDb.upsertRunArtifact({
    run_id: 'run-art-s01',
    artifact_type: 'needset',
    category: 'mouse',
    payload: { total_fields: 12, summary: { resolved: 8, missing: 4 } },
  });

  const row = specDb.getRunArtifact('run-art-s01', 'needset');
  assert.ok(row);
  assert.equal(row.run_id, 'run-art-s01');
  assert.equal(row.artifact_type, 'needset');
  assert.equal(row.category, 'mouse');
  assert.deepEqual(row.payload, { total_fields: 12, summary: { resolved: 8, missing: 4 } });
});

test('upsertRunArtifact accepts pre-serialized string payload', () => {
  const { specDb } = createHarness();

  specDb.upsertRunArtifact({
    run_id: 'run-art-s02',
    artifact_type: 'needset',
    category: 'mouse',
    payload: '{"pre":"serialized"}',
  });

  const row = specDb.getRunArtifact('run-art-s02', 'needset');
  assert.deepEqual(row.payload, { pre: 'serialized' });
});

test('upsertRunArtifact conflict path updates payload on same (run_id, artifact_type)', () => {
  const { specDb } = createHarness();

  specDb.upsertRunArtifact({
    run_id: 'run-art-s03',
    artifact_type: 'search_profile',
    category: 'mouse',
    payload: { status: 'planned', query_count: 3 },
  });

  specDb.upsertRunArtifact({
    run_id: 'run-art-s03',
    artifact_type: 'search_profile',
    category: 'mouse',
    payload: { status: 'executed', query_count: 8 },
  });

  const row = specDb.getRunArtifact('run-art-s03', 'search_profile');
  assert.deepEqual(row.payload, { status: 'executed', query_count: 8 });

  const count = specDb.db.prepare(
    'SELECT COUNT(*) as c FROM run_artifacts WHERE run_id = ? AND artifact_type = ?'
  ).get('run-art-s03', 'search_profile');
  assert.equal(count.c, 1);
});

test('getRunArtifact returns null for unknown run_id', () => {
  const { specDb } = createHarness();
  const row = specDb.getRunArtifact('nonexistent', 'needset');
  assert.equal(row, null);
});

test('getRunArtifactsByRunId returns all artifact types for a run', () => {
  const { specDb } = createHarness();

  specDb.upsertRunArtifact({ run_id: 'run-art-s05', artifact_type: 'needset', category: 'mouse', payload: { t: 'n' } });
  specDb.upsertRunArtifact({ run_id: 'run-art-s05', artifact_type: 'search_profile', category: 'mouse', payload: { t: 'sp' } });
  specDb.upsertRunArtifact({ run_id: 'run-art-s05', artifact_type: 'brand_resolution', category: 'mouse', payload: { t: 'br' } });
  specDb.upsertRunArtifact({ run_id: 'run-other', artifact_type: 'needset', category: 'mouse', payload: {} });

  const rows = specDb.getRunArtifactsByRunId('run-art-s05');
  assert.equal(rows.length, 3);
  const types = rows.map((r) => r.artifact_type).sort();
  assert.deepEqual(types, ['brand_resolution', 'needset', 'search_profile']);
  assert.deepEqual(rows.find((r) => r.artifact_type === 'needset').payload, { t: 'n' });
});

test('missing payload defaults to empty object', () => {
  const { specDb } = createHarness();

  specDb.upsertRunArtifact({ run_id: 'run-art-s06', artifact_type: 'needset', category: 'mouse' });

  const row = specDb.getRunArtifact('run-art-s06', 'needset');
  assert.ok(row);
  assert.deepEqual(row.payload, {});
});
