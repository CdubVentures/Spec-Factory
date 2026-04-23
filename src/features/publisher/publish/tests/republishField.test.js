import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { republishField } from '../republishField.js';

// WHY: Each test gets a fresh specDb + clean product root to avoid cross-test bleed.
function withFreshEnv(fn) {
  return () => {
    const root = path.join('.tmp', `_test_republish_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(root, { recursive: true });
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

    function makeProductJson(overrides = {}) {
      return {
        schema_version: 2, checkpoint_type: 'product',
        product_id: 'mouse-001', category: 'mouse',
        identity: { brand: 'Test', model: 'Test' },
        sources: [], fields: {}, candidates: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
      };
    }

    let _ctr = 0;
    function seed(productId, fieldKey, value, confidence, sourceType = 'cef', status = 'candidate') {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const sid = `${sourceType}-${productId}-${++_ctr}`;
      specDb.insertFieldCandidate({
        productId, fieldKey, value: serialized,
        sourceId: sid, sourceType, model: 'test-model',
        confidence,
        validationJson: { valid: true, repairs: [], rejections: [] },
        metadataJson: {}, status,
      });
      return sid;
    }

    try {
      fn({ specDb, root, makeProductJson, seed });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('republishField', () => {

  it('no remaining candidates → unpublishes field', withFreshEnv(({ specDb, makeProductJson }) => {
    const productJson = makeProductJson({
      fields: { weight: { value: '58', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    const result = republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: {}, productJson });
    assert.equal(result.status, 'unpublished');
    assert.equal(productJson.fields.weight, undefined);
  }));

  it('all candidates below threshold → demotes + unpublishes', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.3); // below default 0.7
    seed('mouse-001', 'weight', '60', 0.2);
    const productJson = makeProductJson({
      fields: { weight: { value: '58', confidence: 0.3, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    const result = republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: {}, productJson });
    assert.equal(result.status, 'unpublished');
    assert.equal(productJson.fields.weight, undefined);
    // Verify candidates were demoted back to 'candidate' status
    const rows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'weight');
    assert.ok(rows.every(r => r.status === 'candidate'));
  }));

  it('scalar: picks highest confidence above threshold', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.8);
    seed('mouse-001', 'weight', '60', 0.95);
    const productJson = makeProductJson({
      fields: { weight: { value: '58', confidence: 0.8, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    const result = republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: {}, productJson });
    assert.equal(result.status, 'republished');
    assert.equal(productJson.fields.weight.value, 60); // JSON.parse('60') → number
    assert.equal(productJson.fields.weight.confidence, 0.95);
  }));

  it('scalar: marks winner as resolved', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'sensor', 'pixart-3395', 0.9);
    const productJson = makeProductJson({
      fields: { sensor: { value: 'pixart-3395', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    republishField({ specDb, productId: 'mouse-001', fieldKey: 'sensor', config: {}, productJson });
    const rows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'sensor');
    assert.ok(rows.some(r => r.status === 'resolved'));
  }));

  it('set_union: merges all above-threshold candidates arrays', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    // Need a compiled rule that marks this field as set_union
    // Inject compiled rules via specDb mock
    const origGetCompiledRules = specDb.getCompiledRules.bind(specDb);
    specDb.getCompiledRules = () => ({
      ...origGetCompiledRules(),
      fields: { colors: { contract: { shape: 'list', type: 'string', list_rules: { item_union: 'set_union' } } } },
    });

    seed('mouse-001', 'colors', '["black","white"]', 0.9);
    seed('mouse-001', 'colors', '["white","red"]', 0.85);
    const productJson = makeProductJson({
      fields: { colors: { value: '["black"]', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    const result = republishField({ specDb, productId: 'mouse-001', fieldKey: 'colors', config: {}, productJson });
    assert.equal(result.status, 'republished');
    const published = productJson.fields.colors.value;
    assert.ok(Array.isArray(published));
    assert.ok(published.includes('black'));
    assert.ok(published.includes('white'));
    assert.ok(published.includes('red'));
    assert.equal(published.length, 3); // deduped
  }));

  it('source-centric row: builds sources from row columns', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.9, 'cef');
    const productJson = makeProductJson({
      fields: { weight: { value: '58', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: {}, productJson });
    const field = productJson.fields.weight;
    assert.ok(Array.isArray(field.sources));
    assert.equal(field.sources.length, 1);
    assert.equal(field.sources[0].source, 'cef');
    assert.ok(field.sources[0].source_id);
  }));

  it('linked_candidates maps ALL remaining rows', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.9);
    seed('mouse-001', 'weight', '60', 0.5); // below threshold but still linked
    const productJson = makeProductJson({
      fields: { weight: { value: '58', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: {}, productJson });
    const lc = productJson.fields.weight.linked_candidates;
    assert.ok(Array.isArray(lc));
    assert.equal(lc.length, 2); // both rows, not just above-threshold
    assert.ok(lc[0].candidate_id);
    assert.ok(lc[0].source_id);
    assert.ok(lc[0].source_type);
  }));

  it('field not in product.json → unchanged', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.9);
    const productJson = makeProductJson(); // no fields.weight
    const result = republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: {}, productJson });
    assert.equal(result.status, 'unchanged');
  }));

  it('custom threshold via config', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.5); // below default 0.7 but above 0.3
    const productJson = makeProductJson({
      fields: { weight: { value: '58', confidence: 0.5, source: 'pipeline', sources: [], linked_candidates: [] } },
    });
    const result = republishField({ specDb, productId: 'mouse-001', fieldKey: 'weight', config: { publishConfidenceThreshold: 0.3 }, productJson });
    assert.equal(result.status, 'republished');
    assert.ok(productJson.fields.weight);
  }));
});
