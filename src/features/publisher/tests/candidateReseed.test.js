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

  // WHY: Rebuild Contract — field_candidate_evidence is a read projection of
  // metadata.evidence_refs. Deleting the DB and reseeding from JSON must
  // reconstruct both field_candidates AND field_candidate_evidence, otherwise
  // the projection is silently empty after rebuild.
  it('rebuild projects metadata.evidence_refs into field_candidate_evidence', () => {
    writeProduct('mouse-ev-rebuild', {
      category: 'mouse', product_id: 'mouse-ev-rebuild',
      candidates: {
        release_date: [
          {
            value: '2026-06-15',
            source_id: 'rdf-mouse-ev-rebuild-1',
            source_type: 'release_date_finder',
            confidence: 90,
            model: 'gpt-5',
            variant_id: 'v_ev_rt',
            validation: { valid: true, repairs: [], rejections: [] },
            metadata: {
              evidence_refs: [
                { url: 'https://example.com/ev-a', tier: 'tier1', confidence: 95 },
                { url: 'https://example.com/ev-b', tier: 'tier2', confidence: 70 },
              ],
            },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-ev-rebuild', 'release_date', 'rdf-mouse-ev-rebuild-1');
    assert.ok(row?.id, 'candidate row inserted');

    const evidenceRows = specDb.listFieldCandidateEvidenceByCandidateId(row.id);
    assert.equal(evidenceRows.length, 2, 'evidence rows projected on rebuild');

    const byUrl = new Map(evidenceRows.map(r => [r.url, r]));
    const a = byUrl.get('https://example.com/ev-a');
    const b = byUrl.get('https://example.com/ev-b');
    assert.ok(a && b, 'both evidence rows present');
    assert.equal(a.tier, 'tier1');
    assert.equal(a.confidence, 95);
    assert.equal(b.tier, 'tier2');
    assert.equal(b.confidence, 70);
  });

  // WHY: Evidence-upgrade columns (evidence_kind + supporting_evidence) must
  // also rebuild from JSON — the Rebuild Contract says DB is derived state.
  // New-shape evidence_refs in product.json carry these fields; old-shape
  // refs don't, and those columns must be NULL on reseed.
  it('rebuild projects evidence_kind + supporting_evidence when present in JSON', () => {
    writeProduct('mouse-ev-kind', {
      category: 'mouse', product_id: 'mouse-ev-kind',
      candidates: {
        release_date: [
          {
            value: '2024-04-19',
            source_id: 'rdf-mouse-ev-kind-1',
            source_type: 'release_date_finder',
            confidence: 93,
            model: 'gpt-5',
            variant_id: 'v_white',
            validation: { valid: true, repairs: [], rejections: [] },
            metadata: {
              evidence_refs: [
                {
                  url: 'https://corsair.com/explorer/m75',
                  tier: 'tier1',
                  confidence: 93,
                  evidence_kind: 'direct_quote',
                  supporting_evidence: 'As of 04/19/2024, You can now get the M75 AIR in your choice of Black, Grey, or White!',
                },
                {
                  url: 'https://corsair.com/p/white-sku',
                  tier: 'tier1',
                  confidence: 60,
                  evidence_kind: 'identity_only',
                  supporting_evidence: '',
                },
              ],
            },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-ev-kind', 'release_date', 'rdf-mouse-ev-kind-1');
    assert.ok(row?.id);
    const rows = specDb.listFieldCandidateEvidenceByCandidateId(row.id);
    assert.equal(rows.length, 2);
    const byUrl = new Map(rows.map(r => [r.url, r]));
    const direct = byUrl.get('https://corsair.com/explorer/m75');
    const ident = byUrl.get('https://corsair.com/p/white-sku');
    assert.equal(direct.evidence_kind, 'direct_quote');
    assert.ok(direct.supporting_evidence.startsWith('As of 04/19/2024'));
    assert.equal(ident.evidence_kind, 'identity_only');
    assert.equal(ident.supporting_evidence, '');

    // Substantive count skips the identity_only ref.
    assert.equal(specDb.countFieldCandidateSubstantiveEvidenceByCandidateId(row.id), 1);
  });

  it('rebuild writes NULL evidence_kind + supporting_evidence for legacy JSON refs', () => {
    writeProduct('mouse-ev-legacy', {
      category: 'mouse', product_id: 'mouse-ev-legacy',
      candidates: {
        release_date: [
          {
            value: '2023-01-01',
            source_id: 'rdf-mouse-ev-legacy-1',
            source_type: 'release_date_finder',
            confidence: 80,
            model: 'gpt-5',
            variant_id: 'v_legacy',
            validation: { valid: true, repairs: [], rejections: [] },
            metadata: {
              evidence_refs: [
                { url: 'https://legacy.example.com', tier: 'tier1', confidence: 85 }, // no kind/quote
              ],
            },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-ev-legacy', 'release_date', 'rdf-mouse-ev-legacy-1');
    const rows = specDb.listFieldCandidateEvidenceByCandidateId(row.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].evidence_kind, null);
    assert.equal(rows[0].supporting_evidence, null);
    // Legacy NULL still counts as substantive.
    assert.equal(specDb.countFieldCandidateSubstantiveEvidenceByCandidateId(row.id), 1);
  });

  it('rebuild skips evidence projection when metadata.evidence_refs is missing or empty', () => {
    writeProduct('mouse-ev-empty', {
      category: 'mouse', product_id: 'mouse-ev-empty',
      candidates: {
        release_date: [
          {
            value: '2026-07-01',
            source_id: 'rdf-mouse-ev-empty-1',
            source_type: 'release_date_finder',
            confidence: 80,
            variant_id: 'v_ev_empty',
            validation: { valid: true, repairs: [], rejections: [] },
            metadata: {}, // no evidence_refs
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });
    const row = specDb.getFieldCandidateBySourceId('mouse-ev-empty', 'release_date', 'rdf-mouse-ev-empty-1');
    assert.ok(row?.id);
    assert.equal(specDb.listFieldCandidateEvidenceByCandidateId(row.id).length, 0);
  });

  // ── submittedAt preservation across reseed ────────────────────────
  // WHY: Publisher ORDER BY submitted_at DESC is meaningless if every reseeded
  // row shares the same datetime('now'). The new-format JSON entry carries
  // submitted_at; reseed must preserve it end-to-end.

  it('preserves submitted_at from new-format JSON entry', () => {
    const ts = '2026-04-20T04:41:12.355Z';
    writeProduct('mouse-ts-rt', {
      category: 'mouse', product_id: 'mouse-ts-rt',
      candidates: {
        colors: [
          {
            value: ['yellow+black'],
            source_id: 'cef-mouse-ts-rt-1',
            source_type: 'cef',
            confidence: 95,
            model: 'gpt-5.4',
            submitted_at: ts,
            variant_id: 'v_edition',
            validation: { valid: true, repairs: [], rejections: [] },
            metadata: { variant_key: 'edition:launch-edition' },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-ts-rt', 'colors', 'cef-mouse-ts-rt-1');
    assert.ok(row, 'row inserted');
    assert.equal(row.submitted_at, ts, 'submitted_at preserved from JSON');
  });

  it('reseed without submitted_at uses SQL default and does not throw', () => {
    writeProduct('mouse-ts-legacy', {
      category: 'mouse', product_id: 'mouse-ts-legacy',
      candidates: {
        colors: [
          {
            value: ['black'],
            source_id: 'cef-mouse-ts-legacy-1',
            source_type: 'cef',
            confidence: 90,
            model: 'gpt-5',
            variant_id: 'v_black',
            validation: { valid: true, repairs: [], rejections: [] },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-ts-legacy', 'colors', 'cef-mouse-ts-legacy-1');
    assert.ok(row);
    assert.ok(row.submitted_at, 'SQL default applied when JSON has no submitted_at');
  });

  // ── Evidence re-projection heals stale SQL state ───────────────────
  // WHY: If SQL has a candidate row whose evidence table is empty or partial
  // (e.g. a prior reseed inserted the row from a JSON state that lacked
  // evidence_refs, and later the JSON was updated with evidence), a subsequent
  // reseed must heal the projection — NOT silently skip because the row
  // already exists. This is Root cause C in the fix plan.

  it('reseed heals stale field_candidate_evidence when candidate row exists with empty evidence', () => {
    // Seed an existing candidate row with ZERO evidence rows
    specDb.insertFieldCandidate({
      productId: 'mouse-ev-heal', fieldKey: 'colors',
      sourceId: 'cef-mouse-ev-heal-1', sourceType: 'cef',
      value: '["black"]', confidence: 90, model: 'gpt-5',
      validationJson: {}, metadataJson: {},
      variantId: 'v_heal',
    });
    const preRow = specDb.getFieldCandidateBySourceId('mouse-ev-heal', 'colors', 'cef-mouse-ev-heal-1');
    assert.ok(preRow?.id);
    assert.equal(specDb.listFieldCandidateEvidenceByCandidateId(preRow.id).length, 0);

    // JSON NOW has evidence_refs — reseed should project them even though
    // the candidate row already exists.
    writeProduct('mouse-ev-heal', {
      category: 'mouse', product_id: 'mouse-ev-heal',
      candidates: {
        colors: [
          {
            value: ['black'],
            source_id: 'cef-mouse-ev-heal-1',
            source_type: 'cef',
            confidence: 90,
            model: 'gpt-5',
            variant_id: 'v_heal',
            validation: { valid: true, repairs: [], rejections: [] },
            metadata: {
              evidence_refs: [
                { url: 'https://example.com/heal-a', tier: 'tier1', confidence: 95 },
                { url: 'https://example.com/heal-b', tier: 'tier1', confidence: 90 },
                { url: 'https://example.com/heal-c', tier: 'tier3', confidence: 85 },
              ],
            },
          },
        ],
      },
    });

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const postRow = specDb.getFieldCandidateBySourceId('mouse-ev-heal', 'colors', 'cef-mouse-ev-heal-1');
    assert.ok(postRow?.id);
    const evidence = specDb.listFieldCandidateEvidenceByCandidateId(postRow.id);
    assert.equal(evidence.length, 3, 'evidence re-projected from JSON despite row already existing');
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
