import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SpecDb } from '../../../../db/specDb.js';
import { renameEnumValueInProducts } from '../componentImpact.js';

function createHarness() {
  const root = path.join('.tmp', `_test_enum_rename_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(root, { recursive: true });
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  function writeProduct(productId, data) {
    const dir = path.join(root, productId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
      schema_version: 2,
      checkpoint_type: 'product',
      product_id: productId,
      category: 'mouse',
      identity: { brand: 'Test', model: 'Test' },
      sources: [],
      fields: {},
      candidates: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...data,
    }, null, 2));
  }

  function readProduct(productId) {
    return JSON.parse(fs.readFileSync(path.join(root, productId, 'product.json'), 'utf8'));
  }

  return { root, specDb, writeProduct, readProduct };
}

test('renameEnumValueInProducts updates published enum mirrors and preserves candidates plus evidence', async () => {
  const harness = createHarness();
  try {
    harness.specDb.insertFieldCandidate({
      productId: 'mouse-rename',
      fieldKey: 'connection',
      sourceId: 'src-connection-1',
      sourceType: 'key-finder',
      value: 'wired',
      unit: null,
      confidence: 0.95,
      model: 'test-model',
      validationJson: { valid: true },
      metadataJson: { publish_result: { status: 'published' } },
      status: 'resolved',
    });
    const candidate = harness.specDb.getFieldCandidateBySourceId('mouse-rename', 'connection', 'src-connection-1');
    harness.specDb.insertFieldCandidateEvidenceMany(candidate.id, [
      { url: 'https://example.test/spec', tier: 'tier1', confidence: 0.95 },
    ]);
    harness.specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'cabled',
      normalizedValue: 'cabled',
      source: 'manual',
      needsReview: false,
      overridden: true,
    });
    harness.writeProduct('mouse-rename', {
      fields: {
        connection: {
          value: 'wired',
          confidence: 0.95,
          source: 'pipeline',
          linked_candidates: [{ candidate_id: candidate.id, source_id: 'src-connection-1' }],
        },
      },
      candidates: {
        connection: [{ source_id: 'src-connection-1', value: 'wired', confidence: 0.95 }],
      },
    });

    const result = await renameEnumValueInProducts({
      productRoot: harness.root,
      category: 'mouse',
      field: 'connection',
      oldValue: 'wired',
      newValue: 'cabled',
      productIds: ['mouse-rename'],
      specDb: harness.specDb,
    });

    const product = harness.readProduct('mouse-rename');
    const row = harness.specDb.getFieldCandidateBySourceId('mouse-rename', 'connection', 'src-connection-1');

    assert.equal(result.renamed, 1);
    assert.equal(product.fields.connection.value, 'cabled');
    assert.deepEqual(product.candidates.connection, [{ source_id: 'src-connection-1', value: 'wired', confidence: 0.95 }]);
    assert.equal(row.status, 'resolved');
    assert.equal(harness.specDb.listFieldCandidateEvidenceByCandidateId(candidate.id).length, 1);
  } finally {
    harness.specDb.close();
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});
