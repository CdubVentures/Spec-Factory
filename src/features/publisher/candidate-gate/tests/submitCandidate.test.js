import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { submitCandidate } from '../submitCandidate.js';

// --- Factories ---

const PRODUCT_ROOT = path.join('.tmp', '_test_submit_candidate');

function sampleFieldRules() {
  return {
    weight: {
      contract: { shape: 'scalar', type: 'number', unknown_token: 'unk' },
      parse: {},
      enum: { policy: 'open' },
      priority: {},
    },
    colors: {
      contract: {
        shape: 'list', type: 'string', unknown_token: 'unk',
        list_rules: { dedupe: true, sort: 'none', max_items: 100, min_items: 0 },
      },
      parse: {},
      enum: { policy: 'closed', match: { strategy: 'exact' } },
      priority: {},
    },
    sensor_brand: {
      contract: { shape: 'scalar', type: 'string', unknown_token: 'unk' },
      parse: {},
      enum: { policy: 'open_prefer_known', match: { strategy: 'alias' } },
      priority: {},
    },
    coating: {
      contract: { shape: 'scalar', type: 'string', unknown_token: 'unk' },
      parse: {},
      enum: { policy: 'closed', match: { strategy: 'exact' } },
      priority: {},
    },
  };
}

function sampleKnownValues() {
  return {
    colors: { policy: 'closed', values: ['black', 'white', 'red', 'blue'] },
    sensor_brand: { policy: 'open_prefer_known', values: ['pixart', 'razer'] },
    coating: { policy: 'closed', values: ['matte', 'glossy'] },
  };
}

function baseDeps(specDb) {
  return {
    category: 'mouse',
    fieldRules: sampleFieldRules(),
    knownValues: sampleKnownValues(),
    componentDb: null,
    specDb,
    productRoot: PRODUCT_ROOT,
  };
}

function ensureProductJson(productId, data = {}) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  const base = {
    schema_version: 2,
    checkpoint_type: 'product',
    product_id: productId,
    category: 'mouse',
    identity: { brand: 'Test', model: 'Test' },
    sources: [],
    fields: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...data,
  };
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(base, null, 2));
  return base;
}

function readProductJson(productId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, 'product.json'), 'utf8'));
  } catch { return null; }
}

describe('submitCandidate', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  // --- 1. Happy path: scalar accepted ---
  it('accepts a valid scalar value and dual-writes', () => {
    ensureProductJson('mouse-scalar');
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-scalar',
      fieldKey: 'weight',
      value: 58,
      confidence: 92,
      sourceMeta: { artifact: 'abc123', url: 'https://razer.com', run_id: 'run-1' },
    });

    assert.equal(result.status, 'accepted');
    assert.ok(result.candidateId > 0);
    assert.equal(result.value, 58);
    assert.equal(result.validationResult.valid, true);

    // DB row exists
    const dbRow = specDb.getFieldCandidate('mouse-scalar', 'weight', '58');
    assert.ok(dbRow);
    assert.equal(dbRow.confidence, 92);

    // JSON candidate exists
    const pj = readProductJson('mouse-scalar');
    assert.ok(pj.candidates);
    assert.ok(pj.candidates.weight);
    assert.equal(pj.candidates.weight.length, 1);
    assert.equal(pj.candidates.weight[0].value, 58);
  });

  // --- 2. Happy path: list accepted ---
  it('accepts a valid list value with correct serialization', () => {
    ensureProductJson('mouse-list');
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-list',
      fieldKey: 'colors',
      value: ['black', 'white'],
      confidence: 100,
      sourceMeta: { model: 'gemini-2.5-flash', run_id: 'cef-1' },
    });

    assert.equal(result.status, 'accepted');
    assert.deepEqual(result.value, ['black', 'white']);

    // DB stores serialized value
    const dbRow = specDb.getFieldCandidate('mouse-list', 'colors', JSON.stringify(['black', 'white']));
    assert.ok(dbRow);

    // JSON stores native array
    const pj = readProductJson('mouse-list');
    assert.ok(Array.isArray(pj.candidates.colors[0].value));
    assert.deepEqual(pj.candidates.colors[0].value, ['black', 'white']);
  });

  // --- 3. Rejection: shape mismatch ---
  it('rejects shape mismatch and writes nothing', () => {
    ensureProductJson('mouse-shape');
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-shape',
      fieldKey: 'weight',
      value: [58, 59], // list when scalar expected
      confidence: 80,
      sourceMeta: { run_id: 'run-1' },
    });

    assert.equal(result.status, 'rejected');
    assert.equal(result.candidateId, null);
    assert.equal(result.validationResult.valid, false);

    // No DB row
    const dbRows = specDb.getAllFieldCandidatesByProduct('mouse-shape');
    assert.equal(dbRows.length, 0);

    // No JSON candidate
    const pj = readProductJson('mouse-shape');
    assert.ok(!pj.candidates || !pj.candidates.weight);
  });

  // --- 4. Rejection: no field rule ---
  it('rejects when field rule is missing', () => {
    ensureProductJson('mouse-norule');
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-norule',
      fieldKey: 'nonexistent_field',
      value: 'test',
      confidence: 50,
      sourceMeta: { run_id: 'run-1' },
    });

    assert.equal(result.status, 'rejected');
    assert.equal(result.candidateId, null);
    assert.ok(result.validationResult.rejections.some(r => r.reason_code === 'no_field_rule'));
  });

  // --- 5. Rejection: missing identity ---
  it('rejects when productId is missing', () => {
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: '',
      fieldKey: 'weight',
      value: 58,
      confidence: 50,
      sourceMeta: { run_id: 'run-1' },
    });

    assert.equal(result.status, 'rejected');
    assert.ok(result.validationResult.rejections.some(r => r.reason_code === 'missing_identity'));
  });

  // --- 6. Repairs applied ---
  it('persists repaired value with validation history', () => {
    ensureProductJson('mouse-repair');
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-repair',
      fieldKey: 'weight',
      value: '58.7', // string → coerced to number
      confidence: 80,
      sourceMeta: { run_id: 'run-1' },
    });

    assert.equal(result.status, 'accepted');
    assert.equal(typeof result.value, 'number');
    assert.ok(result.validationResult.repairs.length > 0);

    // DB has validation history
    const dbRow = specDb.getFieldCandidate('mouse-repair', 'weight', String(result.value));
    assert.ok(dbRow);
    assert.ok(dbRow.validation_json.repairs.length > 0);
  });

  // --- 7. Source merge: same value twice ---
  it('merges sources when same value submitted again', () => {
    ensureProductJson('mouse-merge');
    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-merge',
      fieldKey: 'weight',
      value: 58,
      confidence: 80,
      sourceMeta: { artifact: 'aaa', url: 'https://razer.com', run_id: 'run-1' },
    });

    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-merge',
      fieldKey: 'weight',
      value: 58,
      confidence: 95,
      sourceMeta: { artifact: 'bbb', url: 'https://rtings.com', run_id: 'run-1' },
    });

    // DB: one row, 2 sources
    const dbRow = specDb.getFieldCandidate('mouse-merge', 'weight', '58');
    assert.equal(dbRow.source_count, 2);
    assert.equal(dbRow.sources_json.length, 2);
    assert.equal(dbRow.confidence, 95); // MAX

    // JSON: one entry, 2 sources
    const pj = readProductJson('mouse-merge');
    assert.equal(pj.candidates.weight.length, 1);
    assert.equal(pj.candidates.weight[0].sources.length, 2);
  });

  // --- 8. Source merge: different values ---
  it('creates separate candidates for different values', () => {
    ensureProductJson('mouse-diff');
    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-diff',
      fieldKey: 'weight',
      value: 58,
      confidence: 92,
      sourceMeta: { run_id: 'run-1' },
    });

    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-diff',
      fieldKey: 'weight',
      value: 57,
      confidence: 60,
      sourceMeta: { run_id: 'run-2' },
    });

    // DB: two rows
    const dbRows = specDb.getFieldCandidatesByProductAndField('mouse-diff', 'weight');
    assert.equal(dbRows.length, 2);

    // JSON: two entries
    const pj = readProductJson('mouse-diff');
    assert.equal(pj.candidates.weight.length, 2);
  });

  // --- 9. Discovery enum: open_prefer_known triggers ---
  it('calls persistDiscoveredValue for open_prefer_known fields', () => {
    ensureProductJson('mouse-disc');
    specDb.ensureEnumList('sensor_brand', 'auto_discovery');

    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-disc',
      fieldKey: 'sensor_brand',
      value: 'corsair',
      confidence: 80,
      sourceMeta: { run_id: 'run-1' },
    });

    // New value should be in list_values
    const lv = specDb.getListValueByFieldAndValue('sensor_brand', 'corsair');
    assert.ok(lv, 'corsair should be persisted as discovered enum');
  });

  // --- 10. Discovery enum: closed skips ---
  it('does NOT call persistDiscoveredValue for closed fields', () => {
    ensureProductJson('mouse-closed');

    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-closed',
      fieldKey: 'coating',
      value: 'matte',
      confidence: 80,
      sourceMeta: { run_id: 'run-1' },
    });

    // Closed enum — no discovery writes
    const lv = specDb.getListValueByFieldAndValue('coating', 'matte');
    assert.equal(lv, null);
  });

  // --- 11. Dual-write consistency ---
  it('DB row and JSON entry have identical data', () => {
    ensureProductJson('mouse-dual');
    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-dual',
      fieldKey: 'weight',
      value: 75,
      confidence: 88,
      sourceMeta: { artifact: 'xyz', run_id: 'run-1' },
    });

    const dbRow = specDb.getFieldCandidate('mouse-dual', 'weight', '75');
    const pj = readProductJson('mouse-dual');
    const jsonEntry = pj.candidates.weight[0];

    assert.equal(jsonEntry.value, 75);
    assert.equal(Number(dbRow.value), jsonEntry.value);
    assert.equal(dbRow.sources_json.length, jsonEntry.sources.length);
    assert.equal(dbRow.validation_json.valid, jsonEntry.validation.valid);
  });

  // --- 12. repairHistory passthrough ---
  it('persists llmRepair in validation_json when repairHistory is provided', () => {
    ensureProductJson('mouse-llm-repair');
    const repairHistory = {
      promptId: 'P2',
      status: 'repaired',
      decisions: [
        { value: 'Sky Blue', decision: 'map_to_existing', resolved_to: 'light-blue', reasoning: 'Known color alias' },
        { value: 'Matte Black', decision: 'keep_new', resolved_to: 'matte-black', reasoning: 'New but valid color' },
      ],
    };

    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-llm-repair',
      fieldKey: 'weight',
      value: 62,
      confidence: 90,
      sourceMeta: { run_id: 'run-llm-1' },
      repairHistory,
    });

    assert.equal(result.status, 'accepted');

    // DB: validation_json has llmRepair
    const dbRow = specDb.getFieldCandidate('mouse-llm-repair', 'weight', '62');
    assert.ok(dbRow);
    assert.ok(dbRow.validation_json.llmRepair);
    assert.equal(dbRow.validation_json.llmRepair.promptId, 'P2');
    assert.equal(dbRow.validation_json.llmRepair.status, 'repaired');
    assert.equal(dbRow.validation_json.llmRepair.decisions.length, 2);
    assert.equal(dbRow.validation_json.llmRepair.decisions[0].value, 'Sky Blue');
    assert.equal(dbRow.validation_json.llmRepair.decisions[0].resolved_to, 'light-blue');
    assert.equal(dbRow.validation_json.llmRepair.decisions[1].decision, 'keep_new');

    // JSON: validation also has llmRepair
    const pj = readProductJson('mouse-llm-repair');
    const jsonEntry = pj.candidates.weight[0];
    assert.ok(jsonEntry.validation.llmRepair);
    assert.equal(jsonEntry.validation.llmRepair.promptId, 'P2');
    assert.equal(jsonEntry.validation.llmRepair.decisions.length, 2);
  });

  // --- 13. No repairHistory = no llmRepair key ---
  it('omits llmRepair from validation_json when repairHistory is not provided', () => {
    ensureProductJson('mouse-no-llm');
    const result = submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-no-llm',
      fieldKey: 'weight',
      value: 65,
      confidence: 85,
      sourceMeta: { run_id: 'run-nollm-1' },
    });

    assert.equal(result.status, 'accepted');

    const dbRow = specDb.getFieldCandidate('mouse-no-llm', 'weight', '65');
    assert.ok(dbRow);
    assert.equal(dbRow.validation_json.llmRepair, undefined);
  });

  // --- 14. Product.json missing candidates key ---
  it('creates candidates key on product.json if missing', () => {
    // Write product.json WITHOUT candidates key
    const dir = path.join(PRODUCT_ROOT, 'mouse-nokey');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
      schema_version: 2, checkpoint_type: 'product', product_id: 'mouse-nokey',
      category: 'mouse', identity: {}, sources: [], fields: {},
    }));

    submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-nokey',
      fieldKey: 'weight',
      value: 60,
      confidence: 70,
      sourceMeta: { run_id: 'run-1' },
    });

    const pj = readProductJson('mouse-nokey');
    assert.ok(pj.candidates);
    assert.ok(pj.candidates.weight);
    assert.equal(pj.candidates.weight[0].value, 60);
  });
});
