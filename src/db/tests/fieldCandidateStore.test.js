import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

const TEST_DIR = path.join('.workspace', 'db', '_test_field_candidate_store');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

function sampleCandidate(overrides = {}) {
  return {
    productId: 'mouse-001',
    fieldKey: 'weight',
    value: '58',
    confidence: 92,
    sourceId: overrides.sourceId || `test-mouse-001-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceType: 'test',
    model: '',
    validationJson: { valid: true, repairs: [], rejections: [] },
    ...overrides,
  };
}

describe('fieldCandidateStore', () => {
  let db;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    db = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    try { fs.rmdirSync(TEST_DIR); } catch { /* */ }
  });

  it('upsert + get roundtrip preserves all fields', () => {
    const input = sampleCandidate();
    db.upsertFieldCandidate(input);

    const row = db.getFieldCandidate('mouse-001', 'weight', '58');
    assert.ok(row);
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-001');
    assert.equal(row.field_key, 'weight');
    assert.equal(row.value, '58');
    assert.equal(row.confidence, 92);
    assert.ok(row.source_id);
    assert.ok(row.id > 0);
    assert.ok(row.submitted_at);
    assert.ok(row.updated_at);
  });

  it('JSON columns survive roundtrip', () => {
    db.insertFieldCandidate({
      productId: 'mouse-json',
      fieldKey: 'colors',
      sourceId: 'cef-mouse-json-1',
      sourceType: 'cef',
      value: '["black","white"]',
      confidence: 100,
      model: 'gemini-2.5-flash',
      validationJson: { valid: true, repairs: [{ step: 'normalize', before: 'Grey', after: 'gray', rule: 'token_map' }], rejections: [] },
      metadataJson: { color_names: { black: 'Black' } },
    });

    const row = db.getFieldCandidateBySourceId('mouse-json', 'colors', 'cef-mouse-json-1');
    assert.ok(row);
    assert.ok(typeof row.validation_json === 'object');
    assert.equal(row.validation_json.valid, true);
    assert.equal(row.validation_json.repairs.length, 1);
    assert.equal(row.validation_json.repairs[0].step, 'normalize');
    assert.equal(row.metadata_json.color_names.black, 'Black');
  });

  it('upsert conflict: same source_id updates confidence via MAX', () => {
    const sid = 'test-mouse-conflict-1';
    db.upsertFieldCandidate({ productId: 'mouse-conflict', fieldKey: 'weight', value: '58', confidence: 80, sourceId: sid, sourceType: 'test', model: '', validationJson: {}, metadataJson: {} });
    db.upsertFieldCandidate({ productId: 'mouse-conflict', fieldKey: 'weight', value: '58', confidence: 95, sourceId: sid, sourceType: 'test', model: '', validationJson: {}, metadataJson: {} });

    const all = db.getFieldCandidatesByProductAndField('mouse-conflict', 'weight');
    assert.equal(all.length, 1);
    assert.equal(all[0].confidence, 95); // MAX(80, 95)
  });

  it('get returns null for unknown product', () => {
    const row = db.getFieldCandidate('nonexistent-999', 'weight', '58');
    assert.equal(row, null);
  });

  it('getByProductAndField returns multiple candidates for same field', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-multi', value: '58', confidence: 92 }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-multi', value: '57', confidence: 60 }));

    const rows = db.getFieldCandidatesByProductAndField('mouse-multi', 'weight');
    assert.equal(rows.length, 2);
    // Ordered by confidence DESC
    assert.equal(rows[0].value, '58');
    assert.equal(rows[1].value, '57');
  });

  it('getAllByProduct returns candidates across all fields', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-all', fieldKey: 'weight', value: '58' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-all', fieldKey: 'sensor', value: 'Focus Pro 30K' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-all', fieldKey: 'dpi', value: '30000' }));

    const rows = db.getAllFieldCandidatesByProduct('mouse-all');
    assert.equal(rows.length, 3);
    const fieldKeys = rows.map(r => r.field_key);
    assert.ok(fieldKeys.includes('weight'));
    assert.ok(fieldKeys.includes('sensor'));
    assert.ok(fieldKeys.includes('dpi'));
  });

  it('deleteByProduct removes all rows for product', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-del', fieldKey: 'weight', value: '58' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-del', fieldKey: 'sensor', value: 'PAW3395' }));

    db.deleteFieldCandidatesByProduct('mouse-del');

    const rows = db.getAllFieldCandidatesByProduct('mouse-del');
    assert.equal(rows.length, 0);
  });

  it('deleteByProductAndField removes only that field, others untouched', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-delf', fieldKey: 'weight', value: '58' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-delf', fieldKey: 'sensor', value: 'PAW3395' }));

    db.deleteFieldCandidatesByProductAndField('mouse-delf', 'weight');

    const remaining = db.getAllFieldCandidatesByProduct('mouse-delf');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].field_key, 'sensor');
  });

  it('category isolation: different categories do not leak', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-iso', fieldKey: 'weight', value: '58' }));

    // Create a second SpecDb with different category but same DB file
    const kbDb = new SpecDb({ dbPath: DB_PATH, category: 'keyboard' });
    kbDb.upsertFieldCandidate({
      productId: 'kb-iso',
      fieldKey: 'weight',
      value: '800',
      confidence: 50,
      sourceCount: 1,
      sourcesJson: [],
      validationJson: {},
    });

    const mouseRows = db.getAllFieldCandidatesByProduct('mouse-iso');
    assert.equal(mouseRows.length, 1);
    assert.equal(mouseRows[0].category, 'mouse');

    const kbRows = kbDb.getAllFieldCandidatesByProduct('kb-iso');
    assert.equal(kbRows.length, 1);
    assert.equal(kbRows[0].category, 'keyboard');

    kbDb.close();
  });

  it('upsert re-insert: confidence takes MAX', () => {
    const sid = 'test-mouse-merge-1';
    db.upsertFieldCandidate({ productId: 'mouse-merge', fieldKey: 'weight', value: '58', confidence: 80, sourceId: sid, sourceType: 'test', model: '', validationJson: {}, metadataJson: {} });
    db.upsertFieldCandidate({ productId: 'mouse-merge', fieldKey: 'weight', value: '58', confidence: 60, sourceId: sid, sourceType: 'test', model: '', validationJson: {}, metadataJson: {} });

    const rows = db.getFieldCandidatesByProductAndField('mouse-merge', 'weight');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].confidence, 80); // MAX(80, 60) = 80
  });

  it('status defaults to candidate, can be set to resolved via upsert', () => {
    const sid = 'test-mouse-status-1';
    db.upsertFieldCandidate({ productId: 'mouse-status', fieldKey: 'weight', value: '58', confidence: 80, sourceId: sid, sourceType: 'test', model: '', validationJson: {}, metadataJson: {} });
    const candidateRow = db.getFieldCandidateBySourceId('mouse-status', 'weight', sid);
    assert.equal(candidateRow.status, 'candidate');

    db.upsertFieldCandidate({ productId: 'mouse-status', fieldKey: 'weight', value: '58', confidence: 80, sourceId: sid, sourceType: 'test', model: '', validationJson: {}, metadataJson: {}, status: 'resolved' });
    const resolvedRow = db.getFieldCandidateBySourceId('mouse-status', 'weight', sid);
    assert.equal(resolvedRow.status, 'resolved');
  });

  // --- Paginated query tests ---

  it('getPaginated returns rows with limit and offset', () => {
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-page', fieldKey: 'weight', value: '50' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-page', fieldKey: 'weight', value: '51' }));
    db.upsertFieldCandidate(sampleCandidate({ productId: 'mouse-page', fieldKey: 'sensor', value: 'PAW3395' }));

    const page1 = db.getFieldCandidatesPaginated({ limit: 2, offset: 0 });
    assert.ok(page1.length <= 2);

    const page2 = db.getFieldCandidatesPaginated({ limit: 2, offset: 2 });
    assert.ok(page2.length >= 0);
    // No overlap between pages
    const page1Ids = new Set(page1.map(r => r.id));
    for (const row of page2) {
      assert.ok(!page1Ids.has(row.id), 'pages should not overlap');
    }
  });

  it('getPaginated hydrates JSON columns', () => {
    db.insertFieldCandidate({
      productId: 'mouse-page-json', fieldKey: 'weight',
      sourceId: 'test-mouse-page-json-1', sourceType: 'test',
      value: '99', confidence: 80, model: 'gemini',
      validationJson: { valid: true, repairs: [{ step: 'unit', before: '99g', after: '99', rule: 'strip_unit' }], rejections: [] },
      metadataJson: {},
    });

    const rows = db.getFieldCandidatesPaginated({ limit: 100, offset: 0 });
    const match = rows.find(r => r.product_id === 'mouse-page-json' && r.value === '99');
    assert.ok(match);
    assert.ok(typeof match.validation_json === 'object');
    assert.equal(match.validation_json.repairs[0].step, 'unit');
    assert.equal(match.source_id, 'test-mouse-page-json-1');
  });

  it('count returns total number of candidates for category', () => {
    const total = db.countFieldCandidates();
    assert.ok(typeof total === 'number');
    assert.ok(total > 0);
  });

  it('stats returns aggregate counts', () => {
    // Ensure we have at least one resolved and one with repairs
    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-stats-r',
      fieldKey: 'weight',
      value: '77',
      status: 'resolved',
      validationJson: { valid: true, repairs: [{ step: 'unit', before: '77g', after: '77', rule: 'strip_unit' }], rejections: [] },
    }));
    db.upsertFieldCandidate(sampleCandidate({
      productId: 'mouse-stats-c',
      fieldKey: 'weight',
      value: '78',
      status: 'candidate',
      validationJson: { valid: true, repairs: [], rejections: [] },
    }));

    const stats = db.getFieldCandidatesStats();
    assert.ok(typeof stats.total === 'number');
    assert.ok(typeof stats.resolved === 'number');
    assert.ok(typeof stats.pending === 'number');
    assert.ok(typeof stats.repaired === 'number');
    assert.ok(typeof stats.products === 'number');
    assert.ok(stats.total > 0);
    assert.ok(stats.resolved >= 1, 'should have at least 1 resolved');
    assert.ok(stats.pending >= 1, 'should have at least 1 pending');
    assert.ok(stats.repaired >= 1, 'should have at least 1 repaired');
    assert.ok(stats.products >= 1, 'should have at least 1 product');
  });

  // ── Source-centric API (Phase 1 — new methods) ─────────────────────

  it('insertFieldCandidate creates a row with source_id', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-ins',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-ins-1',
      sourceType: 'cef',
      value: '58',
      unit: null,
      confidence: 92,
      model: 'gemini-2.5-flash',
      validationJson: { valid: true, repairs: [], rejections: [] },
      metadataJson: {},
    });

    const row = db.getFieldCandidateBySourceId('mouse-src-ins', 'weight', 'cef-mouse-src-ins-1');
    assert.ok(row);
    assert.equal(row.source_id, 'cef-mouse-src-ins-1');
    assert.equal(row.source_type, 'cef');
    assert.equal(row.value, '58');
    assert.equal(row.confidence, 92);
    assert.equal(row.model, 'gemini-2.5-flash');
    assert.equal(row.status, 'candidate');
  });

  it('insertFieldCandidate duplicate source_id is idempotent (no-op)', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-dup',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-dup-1',
      sourceType: 'cef',
      value: '58',
      confidence: 80,
      model: 'gemini-2.5-flash',
      validationJson: {},
      metadataJson: {},
    });

    // Second insert with same source_id — should be no-op, not throw
    db.insertFieldCandidate({
      productId: 'mouse-src-dup',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-dup-1',
      sourceType: 'cef',
      value: '59',
      confidence: 99,
      model: 'gpt-5',
      validationJson: {},
      metadataJson: {},
    });

    // Original row preserved, not overwritten
    const row = db.getFieldCandidateBySourceId('mouse-src-dup', 'weight', 'cef-mouse-src-dup-1');
    assert.equal(row.value, '58');
    assert.equal(row.confidence, 80);
  });

  it('same value + different source_id creates two rows', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-2row',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-2row-1',
      sourceType: 'cef',
      value: '58',
      confidence: 80,
      model: 'gemini-2.5-flash',
      validationJson: {},
      metadataJson: {},
    });

    db.insertFieldCandidate({
      productId: 'mouse-src-2row',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-2row-2',
      sourceType: 'cef',
      value: '58',
      confidence: 95,
      model: 'gpt-5',
      validationJson: {},
      metadataJson: {},
    });

    const rows = db.getFieldCandidatesByProductAndField('mouse-src-2row', 'weight');
    assert.equal(rows.length, 2);
  });

  it('deleteFieldCandidateBySourceId removes exactly one row', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-del',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-del-1',
      sourceType: 'cef',
      value: '58',
      confidence: 80,
      model: 'gemini',
      validationJson: {},
      metadataJson: {},
    });

    db.insertFieldCandidate({
      productId: 'mouse-src-del',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-del-2',
      sourceType: 'cef',
      value: '59',
      confidence: 90,
      model: 'gemini',
      validationJson: {},
      metadataJson: {},
    });

    db.deleteFieldCandidateBySourceId('mouse-src-del', 'weight', 'cef-mouse-src-del-1');

    const rows = db.getFieldCandidatesByProductAndField('mouse-src-del', 'weight');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_id, 'cef-mouse-src-del-2');
  });

  it('deleteFieldCandidatesBySourceType removes all rows for that type', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-deltype',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-deltype-1',
      sourceType: 'cef',
      value: '58',
      confidence: 80,
      model: 'gemini',
      validationJson: {},
      metadataJson: {},
    });

    db.insertFieldCandidate({
      productId: 'mouse-src-deltype',
      fieldKey: 'weight',
      sourceId: 'review-mouse-src-deltype-1',
      sourceType: 'review',
      value: '58',
      confidence: 100,
      model: '',
      validationJson: {},
      metadataJson: {},
    });

    db.deleteFieldCandidatesBySourceType('mouse-src-deltype', 'weight', 'cef');

    const rows = db.getFieldCandidatesByProductAndField('mouse-src-deltype', 'weight');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_type, 'review');
  });

  it('markFieldCandidateResolvedByValue marks ALL source-rows for that value', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-resolve',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-resolve-1',
      sourceType: 'cef',
      value: '58',
      confidence: 80,
      model: 'gemini',
      validationJson: {},
      metadataJson: {},
    });

    db.insertFieldCandidate({
      productId: 'mouse-src-resolve',
      fieldKey: 'weight',
      sourceId: 'pipeline-mouse-src-resolve-1',
      sourceType: 'pipeline',
      value: '58',
      confidence: 90,
      model: 'gpt-5',
      validationJson: {},
      metadataJson: {},
    });

    db.markFieldCandidateResolvedByValue('mouse-src-resolve', 'weight', '58');

    const rows = db.getFieldCandidatesByProductAndField('mouse-src-resolve', 'weight');
    assert.ok(rows.every(r => r.status === 'resolved'));
  });

  it('getFieldCandidatesByValue returns all source-rows for a value', () => {
    db.insertFieldCandidate({
      productId: 'mouse-src-byval',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-byval-1',
      sourceType: 'cef',
      value: '58',
      confidence: 80,
      model: 'gemini',
      validationJson: {},
      metadataJson: {},
    });

    db.insertFieldCandidate({
      productId: 'mouse-src-byval',
      fieldKey: 'weight',
      sourceId: 'pipeline-mouse-src-byval-1',
      sourceType: 'pipeline',
      value: '58',
      confidence: 90,
      model: 'gpt-5',
      validationJson: {},
      metadataJson: {},
    });

    // Different value — should not be returned
    db.insertFieldCandidate({
      productId: 'mouse-src-byval',
      fieldKey: 'weight',
      sourceId: 'cef-mouse-src-byval-2',
      sourceType: 'cef',
      value: '59',
      confidence: 70,
      model: 'gemini',
      validationJson: {},
      metadataJson: {},
    });

    const rows = db.getFieldCandidatesByValue('mouse-src-byval', 'weight', '58');
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.value === '58'));
  });

  it('validation_json with llmRepair roundtrips through insert', () => {
    db.insertFieldCandidate({
      productId: 'mouse-llm', fieldKey: 'sensor',
      sourceId: 'test-mouse-llm-1', sourceType: 'test',
      value: 'pixart-3395', confidence: 90, model: '',
      validationJson: {
        valid: true,
        repairs: [{ step: 'normalize', before: 'PixArt 3395', after: 'pixart-3395', rule: 'normalize_chain' }],
        rejections: [],
        llmRepair: {
          promptId: 'P2',
          status: 'repaired',
          decisions: [
            { value: 'PixArt 3395', decision: 'map_to_existing', resolved_to: 'pixart-3395', reasoning: 'Matches known PAW3395 variant' },
          ],
        },
      },
      metadataJson: {},
    });

    const row = db.getFieldCandidateBySourceId('mouse-llm', 'sensor', 'test-mouse-llm-1');
    assert.ok(row);
    assert.ok(row.validation_json.llmRepair);
    assert.equal(row.validation_json.llmRepair.promptId, 'P2');
    assert.equal(row.validation_json.llmRepair.status, 'repaired');
    assert.equal(row.validation_json.llmRepair.decisions.length, 1);
    assert.equal(row.validation_json.llmRepair.decisions[0].decision, 'map_to_existing');
  });

  // ── countBySourceId (cross-field count for cascade gate) ──────────

  it('countFieldCandidatesBySourceId returns 0 for unknown product/source', () => {
    const count = db.countFieldCandidatesBySourceId('nonexistent-pid', 'nonexistent-sid');
    assert.equal(count, 0);
  });

  it('countFieldCandidatesBySourceId returns 1 for a single row', () => {
    const sid = 'cef-mouse-count-1';
    db.insertFieldCandidate({
      productId: 'mouse-count', fieldKey: 'weight', sourceId: sid, sourceType: 'cef',
      value: '58', confidence: 90, model: '', validationJson: {}, metadataJson: {},
    });
    assert.equal(db.countFieldCandidatesBySourceId('mouse-count', sid), 1);
  });

  it('countFieldCandidatesBySourceId returns N across multiple field_keys', () => {
    const sid = 'cef-mouse-multi-1';
    db.insertFieldCandidate({
      productId: 'mouse-multi', fieldKey: 'colors', sourceId: sid, sourceType: 'cef',
      value: '["black"]', confidence: 95, model: '', validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId: 'mouse-multi', fieldKey: 'editions', sourceId: sid, sourceType: 'cef',
      value: '["standard"]', confidence: 90, model: '', validationJson: {}, metadataJson: {},
    });
    assert.equal(db.countFieldCandidatesBySourceId('mouse-multi', sid), 2);
  });

  it('countFieldCandidatesBySourceId decrements after deleteBySourceId for one field', () => {
    const sid = 'cef-mouse-dec-1';
    db.insertFieldCandidate({
      productId: 'mouse-dec', fieldKey: 'colors', sourceId: sid, sourceType: 'cef',
      value: '["red"]', confidence: 80, model: '', validationJson: {}, metadataJson: {},
    });
    db.insertFieldCandidate({
      productId: 'mouse-dec', fieldKey: 'editions', sourceId: sid, sourceType: 'cef',
      value: '["limited"]', confidence: 80, model: '', validationJson: {}, metadataJson: {},
    });
    assert.equal(db.countFieldCandidatesBySourceId('mouse-dec', sid), 2);

    db.deleteFieldCandidateBySourceId('mouse-dec', 'colors', sid);
    assert.equal(db.countFieldCandidatesBySourceId('mouse-dec', sid), 1);

    db.deleteFieldCandidateBySourceId('mouse-dec', 'editions', sid);
    assert.equal(db.countFieldCandidatesBySourceId('mouse-dec', sid), 0);
  });
});
