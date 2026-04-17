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

  // ── Source-centric reseed (Phase 3) ─────────────────────────────────

  it('new-format: source_id per entry → inserts with source_id on row', () => {
    writeProduct('mouse-srcfmt', {
      category: 'mouse', product_id: 'mouse-srcfmt',
      candidates: {
        weight: [
          {
            value: 62,
            source_id: 'cef-mouse-srcfmt-1',
            source_type: 'cef',
            confidence: 95,
            model: 'gemini-2.5-flash',
            validation: { valid: true, repairs: [], rejections: [] },
          },
          {
            value: 63,
            source_id: 'cef-mouse-srcfmt-2',
            source_type: 'cef',
            confidence: 88,
            model: 'gpt-5',
            validation: { valid: true, repairs: [], rejections: [] },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row1 = specDb.getFieldCandidateBySourceId('mouse-srcfmt', 'weight', 'cef-mouse-srcfmt-1');
    assert.ok(row1, 'row with source_id cef-mouse-srcfmt-1 should exist');
    assert.equal(row1.value, '62');
    assert.equal(row1.source_type, 'cef');
    assert.equal(row1.model, 'gemini-2.5-flash');
    assert.equal(row1.confidence, 95);

    const row2 = specDb.getFieldCandidateBySourceId('mouse-srcfmt', 'weight', 'cef-mouse-srcfmt-2');
    assert.ok(row2, 'row with source_id cef-mouse-srcfmt-2 should exist');
    assert.equal(row2.value, '63');
  });

  it('old-format: sources array → explodes into rows with synthetic source_ids', () => {
    writeProduct('mouse-oldfmt', {
      category: 'mouse', product_id: 'mouse-oldfmt',
      candidates: {
        sensor: [{
          value: 'PAW3395',
          validation: { valid: true, repairs: [], rejections: [] },
          sources: [
            { source: 'cef', confidence: 90, model: 'gemini', run_id: 'cef-1', submitted_at: '2026-04-05T00:00:00Z' },
          ],
        }],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const rows = specDb.getFieldCandidatesByProductAndField('mouse-oldfmt', 'sensor');
    assert.ok(rows.length >= 1);
    // Old format rows should get a synthetic source_id (non-empty)
    assert.ok(rows[0].source_id, 'old-format row should have a synthetic source_id');
    assert.ok(rows[0].source_id.length > 0);
  });

  // WHY: Old-format multi-source entries fall back to legacy upsert.
  // After Phase 8 migration, sources_json column is gone — verify row exists with value.
  it('old-format multi-source candidate reseeds via legacy upsert', () => {
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

    const rows = specDb.getFieldCandidatesByProductAndField('mouse-multi', 'weight');
    assert.ok(rows.length >= 1, 'should have at least 1 row for weight');
    assert.equal(rows[0].value, '58');
  });

  it('preserves variant_id through reseed round-trip (new format)', () => {
    writeProduct('mouse-vid-rt', {
      category: 'mouse', product_id: 'mouse-vid-rt',
      candidates: {
        release_date: [
          {
            value: '2026-06-01',
            source_id: 'feature-mouse-vid-rt-1',
            source_type: 'feature',
            confidence: 90,
            model: 'gpt-5',
            variant_id: 'v_round_trip',
            validation: { valid: true, repairs: [], rejections: [] },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-vid-rt', 'release_date', 'feature-mouse-vid-rt-1');
    assert.ok(row, 'row inserted from JSON');
    assert.equal(row.variant_id, 'v_round_trip', 'variant_id preserved through reseed');
  });

  it('old-format: single source with run_number (no run_id) gets deterministic source_id', () => {
    writeProduct('mouse-rn-only', {
      category: 'mouse', product_id: 'mouse-rn-only',
      candidates: {
        weight: [{
          value: 72,
          validation: { valid: true, repairs: [], rejections: [] },
          sources: [
            { source: 'cef', confidence: 88, run_number: 3, model: 'gpt-4o', submitted_at: '2026-04-10T00:00:00Z' },
          ],
        }],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const rows = specDb.getFieldCandidatesByProductAndField('mouse-rn-only', 'weight');
    assert.ok(rows.length >= 1, 'should have at least 1 row');
    // WHY: With run_number=3 and source='cef', deterministic source_id = cef-mouse-rn-only-3
    assert.equal(rows[0].source_id, 'cef-mouse-rn-only-3', 'should derive deterministic source_id from run_number');
    assert.equal(rows[0].source_type, 'cef');
  });
});
