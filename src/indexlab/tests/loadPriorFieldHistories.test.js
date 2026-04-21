// WHY: Loader for prior field histories. Reads the most-recent completed run's
// `field_histories` run_artifact for a given productId so NeedSet can use it
// as `roundContext.previousFieldHistories` and tier-3 repeat_count progresses
// across runs (the B4/tier-3abcd fix).

import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { SpecDb } from '../../db/specDb.js';
import { loadPriorFieldHistories } from '../loadPriorFieldHistories.js';

function makeDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function insertRun(db, { run_id, product_id, status = 'completed', created_at = null }) {
  db.upsertRun({
    run_id,
    category: 'mouse',
    product_id,
    status,
    started_at: created_at || new Date().toISOString(),
    ended_at: created_at || new Date().toISOString(),
    stage_cursor: '',
    identity_fingerprint: '',
    identity_lock_status: '',
    dedupe_mode: '',
    s3key: '',
    out_root: '',
    counters: {},
  });
}

describe('loadPriorFieldHistories', () => {
  it('returns {} when no runs exist for the product', () => {
    const db = makeDb();
    const result = loadPriorFieldHistories(db, 'mouse-abc');
    deepStrictEqual(result, {});
  });

  it('returns {} when the most recent run has no field_histories artifact', () => {
    const db = makeDb();
    insertRun(db, { run_id: 'r1', product_id: 'mouse-abc' });
    db.upsertRunArtifact({ run_id: 'r1', artifact_type: 'needset', category: 'mouse', payload: {} });
    const result = loadPriorFieldHistories(db, 'mouse-abc');
    deepStrictEqual(result, {});
  });

  it('returns the payload when the most recent run has field_histories', () => {
    const db = makeDb();
    insertRun(db, { run_id: 'r1', product_id: 'mouse-abc' });
    const payload = {
      weight: { query_count: 3, existing_queries: ['q1'], domains_tried: ['a.com'] },
      dpi: { query_count: 1, existing_queries: ['q2'] },
    };
    db.upsertRunArtifact({ run_id: 'r1', artifact_type: 'field_histories', category: 'mouse', payload });
    const result = loadPriorFieldHistories(db, 'mouse-abc');
    deepStrictEqual(result, payload);
  });

  it('ignores field_histories from runs of other products', () => {
    const db = makeDb();
    insertRun(db, { run_id: 'r1', product_id: 'mouse-OTHER' });
    db.upsertRunArtifact({
      run_id: 'r1', artifact_type: 'field_histories', category: 'mouse',
      payload: { weight: { query_count: 99 } },
    });
    const result = loadPriorFieldHistories(db, 'mouse-abc');
    deepStrictEqual(result, {});
  });

  it('picks the most recent completed run when multiple exist', () => {
    const db = makeDb();
    insertRun(db, { run_id: 'r1-old', product_id: 'mouse-abc', created_at: '2026-01-01T00:00:00Z' });
    db.upsertRunArtifact({
      run_id: 'r1-old', artifact_type: 'field_histories', category: 'mouse',
      payload: { weight: { query_count: 1 } },
    });
    insertRun(db, { run_id: 'r2-new', product_id: 'mouse-abc', created_at: '2026-02-01T00:00:00Z' });
    db.upsertRunArtifact({
      run_id: 'r2-new', artifact_type: 'field_histories', category: 'mouse',
      payload: { weight: { query_count: 5 } },
    });
    const result = loadPriorFieldHistories(db, 'mouse-abc');
    strictEqual(result.weight.query_count, 5, 'must return the newer run\'s payload');
  });

  it('skips running/failed runs and uses the most recent COMPLETED run', () => {
    const db = makeDb();
    insertRun(db, { run_id: 'r1-old-ok', product_id: 'mouse-abc', status: 'completed', created_at: '2026-01-01T00:00:00Z' });
    db.upsertRunArtifact({
      run_id: 'r1-old-ok', artifact_type: 'field_histories', category: 'mouse',
      payload: { weight: { query_count: 7 } },
    });
    insertRun(db, { run_id: 'r2-newer-running', product_id: 'mouse-abc', status: 'running', created_at: '2026-02-01T00:00:00Z' });
    const result = loadPriorFieldHistories(db, 'mouse-abc');
    strictEqual(result.weight.query_count, 7, 'must skip running run and use older completed run');
  });

  it('returns {} when productId is falsy (graceful)', () => {
    const db = makeDb();
    deepStrictEqual(loadPriorFieldHistories(db, ''), {});
    deepStrictEqual(loadPriorFieldHistories(db, null), {});
    deepStrictEqual(loadPriorFieldHistories(db, undefined), {});
  });

  it('returns {} when specDb is falsy (graceful)', () => {
    deepStrictEqual(loadPriorFieldHistories(null, 'mouse-abc'), {});
    deepStrictEqual(loadPriorFieldHistories(undefined, 'mouse-abc'), {});
  });
});
