import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { rebuildFieldCandidatesFromJson } from '../candidateReseed.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_candidate_reseed');

function writeProduct(productId, data) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(data, null, 2));
}

describe('rebuildFieldCandidatesFromJson', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  it('round-trip: product.json candidates → DB rows', () => {
    writeProduct('mouse-rt', {
      category: 'mouse', product_id: 'mouse-rt',
      candidates: {
        weight: [
          {
            value: 58,
            validation: { valid: true, repairs: [], rejections: [] },
            sources: [{ artifact: 'abc', confidence: 92, run_id: 'run-1', submitted_at: '2026-04-05T00:00:00Z' }],
          },
        ],
        sensor: [
          {
            value: 'Focus Pro 30K',
            validation: { valid: true, repairs: [], rejections: [] },
            sources: [{ artifact: 'def', confidence: 88, run_id: 'run-1', submitted_at: '2026-04-05T00:00:00Z' }],
          },
        ],
      },
    });

    const stats = rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });
    assert.equal(stats.seeded, 1);
    assert.equal(stats.candidates_seeded, 2);

    const weightRows = specDb.getFieldCandidatesByProductAndField('mouse-rt', 'weight');
    assert.equal(weightRows.length, 1);
    assert.equal(weightRows[0].value, '58');
    assert.equal(weightRows[0].confidence, 92);

    const sensorRows = specDb.getFieldCandidatesByProductAndField('mouse-rt', 'sensor');
    assert.equal(sensorRows.length, 1);
    assert.equal(sensorRows[0].value, 'Focus Pro 30K');
  });

  it('empty candidates key → seeded 0', () => {
    writeProduct('mouse-empty', {
      category: 'mouse', product_id: 'mouse-empty',
      candidates: {},
    });

    const stats = rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });
    // mouse-empty has no candidates, mouse-rt from previous test does
    const rows = specDb.getAllFieldCandidatesByProduct('mouse-empty');
    assert.equal(rows.length, 0);
  });

  it('missing product.json → skipped, no crash', () => {
    const emptyDir = path.join(PRODUCT_ROOT, 'mouse-missing');
    fs.mkdirSync(emptyDir, { recursive: true });
    // No product.json inside

    const stats = rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });
    assert.ok(stats.skipped >= 1);
  });

  it('category mismatch → skipped', () => {
    writeProduct('kb-wrong', {
      category: 'keyboard', product_id: 'kb-wrong',
      candidates: {
        weight: [{ value: 800, validation: {}, sources: [] }],
      },
    });

    const stats = rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });
    const rows = specDb.getAllFieldCandidatesByProduct('kb-wrong');
    assert.equal(rows.length, 0);
  });

  it('multiple products seeded independently', () => {
    writeProduct('mouse-a', {
      category: 'mouse', product_id: 'mouse-a',
      candidates: {
        weight: [{ value: 60, validation: {}, sources: [{ confidence: 80 }] }],
      },
    });
    writeProduct('mouse-b', {
      category: 'mouse', product_id: 'mouse-b',
      candidates: {
        weight: [{ value: 70, validation: {}, sources: [{ confidence: 90 }] }],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const rowsA = specDb.getAllFieldCandidatesByProduct('mouse-a');
    const rowsB = specDb.getAllFieldCandidatesByProduct('mouse-b');
    assert.ok(rowsA.length >= 1);
    assert.ok(rowsB.length >= 1);
    assert.equal(rowsA[0].value, '60');
    assert.equal(rowsB[0].value, '70');
  });

  it('multi-source candidate preserves sources_json array', () => {
    writeProduct('mouse-multi', {
      category: 'mouse', product_id: 'mouse-multi',
      candidates: {
        weight: [{
          value: 58,
          validation: { valid: true, repairs: [], rejections: [] },
          sources: [
            { artifact: 'aaa', confidence: 92, run_id: 'run-1' },
            { artifact: 'bbb', confidence: 88, run_id: 'run-1' },
          ],
        }],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidate('mouse-multi', 'weight', '58');
    assert.ok(row);
    assert.equal(row.sources_json.length, 2);
    assert.equal(row.sources_json[0].artifact, 'aaa');
    assert.equal(row.sources_json[1].artifact, 'bbb');
    assert.equal(row.source_count, 2);
  });
});
