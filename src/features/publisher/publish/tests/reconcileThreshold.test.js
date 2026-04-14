import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { reconcileThreshold } from '../reconcileThreshold.js';

// WHY: Each test gets a fresh specDb + clean product root to avoid cross-test bleed.
// reconcileThreshold scans ALL products, so shared state corrupts counts.

function withFreshEnv(fn) {
  return () => {
    const root = path.join('.tmp', `_test_reconcile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(root, { recursive: true });
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

    function ensureProductJson(productId, data = {}) {
      const dir = path.join(root, productId);
      fs.mkdirSync(dir, { recursive: true });
      const base = {
        schema_version: 2, checkpoint_type: 'product',
        product_id: productId, category: 'mouse',
        identity: { brand: 'Test', model: 'Test' },
        sources: [], fields: {}, candidates: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data,
      };
      fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(base, null, 2));
    }

    function readProductJson(productId) {
      try { return JSON.parse(fs.readFileSync(path.join(root, productId, 'product.json'), 'utf8')); }
      catch { return null; }
    }

    let _seedCtr = 0;
    function seed(productId, fieldKey, value, confidence, status = 'candidate', meta = {}) {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      specDb.insertFieldCandidate({
        productId, fieldKey, value: serialized,
        sourceId: `test-${productId}-${fieldKey}-${++_seedCtr}`,
        sourceType: 'test', model: '',
        confidence,
        validationJson: { valid: true, repairs: [], rejections: [] },
        metadataJson: meta, status,
      });
    }

    try {
      fn({ specDb, root, ensureProductJson, readProductJson, seed });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('reconcileThreshold', () => {

  it('dry-run returns counts without modifying data', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1', {
      fields: { weight: { value: 58, confidence: 75, source: 'pipeline', resolved_at: new Date().toISOString(), sources: [] } },
    });
    seed('p1', 'weight', 58, 75, 'resolved');

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.85, productRoot: root, dryRun: true });

    assert.equal(result.unpublished, 1);
    const row = specDb.getResolvedFieldCandidate('p1', 'weight');
    assert.ok(row); // still resolved (dry run)
  }));

  it('tightening: unpublishes values below new threshold', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    ensureProductJson('p1', {
      fields: { weight: { value: 58, confidence: 75, source: 'pipeline', resolved_at: new Date().toISOString(), sources: [] } },
    });
    seed('p1', 'weight', 58, 75, 'resolved');

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.85, productRoot: root, dryRun: false });

    assert.equal(result.unpublished, 1);
    assert.equal(specDb.getResolvedFieldCandidate('p1', 'weight'), null);
    assert.equal(readProductJson('p1').fields.weight, undefined);
  }));

  it('loosening: publishes candidates above new threshold', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    ensureProductJson('p1');
    seed('p1', 'weight', 58, 80, 'candidate');

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.7, productRoot: root, dryRun: false });

    assert.equal(result.published, 1);
    const row = specDb.getResolvedFieldCandidate('p1', 'weight');
    assert.ok(row);
    assert.equal(row.status, 'resolved');
    const pj = readProductJson('p1');
    assert.ok(pj.fields.weight);
    assert.equal(pj.fields.weight.confidence, 80);
  }));

  it('skips manual overrides (locked)', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1', {
      fields: { weight: { value: 99, confidence: 1.0, source: 'manual_override', resolved_at: new Date().toISOString(), sources: [] } },
    });
    seed('p1', 'weight', 99, 1.0, 'resolved', { source: 'manual_override' });

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.99, productRoot: root, dryRun: false });

    assert.equal(result.locked, 1);
    assert.equal(result.unpublished, 0);
    assert.ok(specDb.getResolvedFieldCandidate('p1', 'weight'));
  }));

  it('normalizes 0-100 confidence to 0-1 before comparison', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1');
    seed('p1', 'weight', 58, 100, 'candidate');

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.9, productRoot: root, dryRun: false });

    assert.equal(result.published, 1); // 100 → 1.0 >= 0.9
  }));

  it('does not publish candidates below threshold after normalization', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1');
    seed('p1', 'weight', 58, 60, 'candidate'); // 60 → 0.6

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.7, productRoot: root, dryRun: false });

    assert.equal(result.published, 0);
    assert.equal(result.unaffected, 1);
  }));

  it('calls onStageAdvance with stage names', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1');
    seed('p1', 'weight', 58, 90, 'candidate');

    const stages = [];
    reconcileThreshold({
      specDb, category: 'mouse', threshold: 0.7,
      productRoot: root, dryRun: true,
      onStageAdvance: (stage) => stages.push(stage),
    });

    assert.deepEqual(stages, ['Scanning', 'Evaluating', 'Complete']);
  }));

  it('loosening: sources array built from source-centric row columns', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    ensureProductJson('p1');
    // WHY: Seed with known source_id/source_type/model — after loosening publish,
    // product.json fields[].sources must reflect these columns, not be empty.
    specDb.insertFieldCandidate({
      productId: 'p1', fieldKey: 'weight', value: '58',
      sourceId: 'cef-p1-3', sourceType: 'cef', model: 'gpt-4o',
      confidence: 85, validationJson: {}, metadataJson: {},
    });

    reconcileThreshold({ specDb, category: 'mouse', threshold: 0.7, productRoot: root });

    const pj = readProductJson('p1');
    assert.ok(pj.fields.weight, 'field should be published');
    assert.ok(Array.isArray(pj.fields.weight.sources), 'sources should be array');
    assert.ok(pj.fields.weight.sources.length > 0, 'sources should not be empty');
    assert.equal(pj.fields.weight.sources[0].source_id, 'cef-p1-3');
    assert.equal(pj.fields.weight.sources[0].source, 'cef');
    assert.equal(pj.fields.weight.sources[0].model, 'gpt-4o');
  }));

  it('loosening: metadata upsert uses existing source_id (no duplicate row)', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1');
    specDb.insertFieldCandidate({
      productId: 'p1', fieldKey: 'weight', value: '58',
      sourceId: 'cef-p1-1', sourceType: 'cef', model: '',
      confidence: 90, validationJson: {}, metadataJson: {},
    });

    reconcileThreshold({ specDb, category: 'mouse', threshold: 0.7, productRoot: root });

    // WHY: After publish, there should be exactly 1 row — the original.
    // The metadata upsert must target the existing source_id, not create a legacy-* duplicate.
    const rows = specDb.getFieldCandidatesByProductAndField('p1', 'weight');
    assert.equal(rows.length, 1, 'should be exactly 1 row, not a duplicate');
    assert.equal(rows[0].source_id, 'cef-p1-1', 'source_id must be preserved');
    assert.ok(rows[0].metadata_json?.publish_result, 'publish_result should be in metadata');
  }));

  it('publishes highest-confidence candidate when multiple exist', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    ensureProductJson('p1');
    seed('p1', 'weight', 55, 70, 'candidate');
    seed('p1', 'weight', 58, 90, 'candidate');
    seed('p1', 'weight', 60, 80, 'candidate');

    const result = reconcileThreshold({ specDb, category: 'mouse', threshold: 0.7, productRoot: root, dryRun: false });

    assert.equal(result.published, 1);
    const resolved = specDb.getResolvedFieldCandidate('p1', 'weight');
    assert.equal(resolved.value, '58'); // highest confidence (90 → 0.9)
  }));
});
