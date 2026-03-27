import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

test('SpecDb constructor creates run_artifacts table without error', () => {
  const { specDb } = createHarness();
  const row = specDb.db.prepare('SELECT * FROM run_artifacts LIMIT 0').get();
  assert.equal(row, undefined);
});

test('_upsertRunArtifact + _getRunArtifact roundtrip preserves all fields', () => {
  const { specDb } = createHarness();

  specDb._upsertRunArtifact.run({
    run_id: 'run-art-001',
    artifact_type: 'needset',
    category: 'mouse',
    payload: '{"total_fields":12,"summary":"test"}',
  });

  const row = specDb._getRunArtifact.get('run-art-001', 'needset');
  assert.ok(row);
  assert.equal(row.run_id, 'run-art-001');
  assert.equal(row.artifact_type, 'needset');
  assert.equal(row.category, 'mouse');
  assert.equal(row.payload, '{"total_fields":12,"summary":"test"}');
  assert.ok(row.created_at);
  assert.ok(row.updated_at);
});

test('_upsertRunArtifact conflict path updates payload on same (run_id, artifact_type)', () => {
  const { specDb } = createHarness();

  specDb._upsertRunArtifact.run({
    run_id: 'run-art-002',
    artifact_type: 'search_profile',
    category: 'mouse',
    payload: '{"status":"planned","query_count":3}',
  });

  const before = specDb._getRunArtifact.get('run-art-002', 'search_profile');
  assert.equal(before.payload, '{"status":"planned","query_count":3}');

  specDb._upsertRunArtifact.run({
    run_id: 'run-art-002',
    artifact_type: 'search_profile',
    category: 'mouse',
    payload: '{"status":"executed","query_count":8}',
  });

  const after = specDb._getRunArtifact.get('run-art-002', 'search_profile');
  assert.equal(after.payload, '{"status":"executed","query_count":8}');

  const count = specDb.db.prepare(
    'SELECT COUNT(*) as c FROM run_artifacts WHERE run_id = ? AND artifact_type = ?'
  ).get('run-art-002', 'search_profile');
  assert.equal(count.c, 1, 'should be exactly 1 row after upsert');
});

test('_getRunArtifactsByRunId returns all artifacts for a run', () => {
  const { specDb } = createHarness();

  specDb._upsertRunArtifact.run({
    run_id: 'run-art-003',
    artifact_type: 'needset',
    category: 'mouse',
    payload: '{"type":"needset"}',
  });
  specDb._upsertRunArtifact.run({
    run_id: 'run-art-003',
    artifact_type: 'search_profile',
    category: 'mouse',
    payload: '{"type":"search_profile"}',
  });
  specDb._upsertRunArtifact.run({
    run_id: 'run-art-003',
    artifact_type: 'brand_resolution',
    category: 'mouse',
    payload: '{"type":"brand_resolution"}',
  });
  // Different run — should not appear
  specDb._upsertRunArtifact.run({
    run_id: 'run-art-other',
    artifact_type: 'needset',
    category: 'mouse',
    payload: '{}',
  });

  const rows = specDb._getRunArtifactsByRunId.all('run-art-003');
  assert.equal(rows.length, 3);
  const types = rows.map((r) => r.artifact_type).sort();
  assert.deepEqual(types, ['brand_resolution', 'needset', 'search_profile']);
});

test('_getRunArtifact returns undefined for unknown run_id', () => {
  const { specDb } = createHarness();
  const row = specDb._getRunArtifact.get('nonexistent', 'needset');
  assert.equal(row, undefined);
});

test('large nested JSON payload survives roundtrip exactly', () => {
  const { specDb } = createHarness();

  const largePayload = {
    run_id: 'run-art-004',
    category: 'mouse',
    product_id: 'mouse-razer-viper',
    total_fields: 60,
    generated_at: '2026-03-26T10:00:00.000Z',
    summary: { total: 60, resolved: 35, core_unresolved: 15 },
    fields: Array.from({ length: 60 }, (_, i) => ({
      field_key: `field_${i}`,
      state: i < 35 ? 'accepted' : 'missing',
      need_score: Math.random(),
      required_level: i < 20 ? 'required' : 'optional',
    })),
  };
  const payloadStr = JSON.stringify(largePayload);

  specDb._upsertRunArtifact.run({
    run_id: 'run-art-004',
    artifact_type: 'needset',
    category: 'mouse',
    payload: payloadStr,
  });

  const row = specDb._getRunArtifact.get('run-art-004', 'needset');
  assert.equal(row.payload, payloadStr, 'payload must survive roundtrip exactly');
});
