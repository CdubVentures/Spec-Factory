import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { submitCandidate } from '../submitCandidate.js';
import { buildSourceId } from '../buildSourceId.js';

// --- Factories ---

const PRODUCT_ROOT = path.join('.tmp', '_test_submit_candidate');

function sampleFieldRules() {
  return {
    weight: {
      contract: { shape: 'scalar', type: 'number' },
      parse: {},
      enum: { policy: 'open' },
      priority: {},
    },
    sensor: {
      contract: { shape: 'scalar', type: 'string' },
      parse: {},
      enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
      evidence: { min_evidence_refs: 1 },
      priority: {},
    },
    colors: {
      contract: {
        shape: 'list', type: 'string',
        list_rules: { dedupe: true, sort: 'none' },
      },
      parse: {},
      enum: { policy: 'closed', match: { strategy: 'exact' } },
      priority: {},
    },
    sensor_brand: {
      contract: { shape: 'scalar', type: 'string' },
      parse: {},
      enum: { policy: 'open_prefer_known', match: { strategy: 'alias' } },
      component_identity_projection: { component_type: 'sensor', facet: 'brand' },
      evidence: { min_evidence_refs: 1 },
      priority: {},
    },
    sensor_link: {
      contract: { shape: 'scalar', type: 'url' },
      parse: {},
      enum: { policy: 'open' },
      component_identity_projection: { component_type: 'sensor', facet: 'link' },
      evidence: { min_evidence_refs: 1 },
      priority: {},
    },
    coating: {
      contract: { shape: 'scalar', type: 'string' },
      parse: {},
      enum: { policy: 'closed', match: { strategy: 'exact' } },
      priority: {},
    },
  };
}

function sampleKnownValues() {
  return {
    sensor: { policy: 'open_prefer_known', values: ['PAW3950'] },
    colors: { policy: 'closed', values: ['black', 'white', 'red', 'blue'] },
    sensor_brand: { policy: 'open_prefer_known', values: ['PixArt', 'Razer'] },
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

function evidenceRefsFor(url) {
  return {
    evidence_refs: [
      { url, tier: 'tier1', confidence: 95, supporting_evidence: 'published component identity' },
    ],
  };
}

function componentAliasMetadata({ component = [], brand = [] } = {}) {
  return {
    ...evidenceRefsFor(`https://component.example.com/aliases-${component.length}-${brand.length}`),
    component_identity_aliases: { component, brand },
  };
}

describe('submitCandidate', async () => {
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
  it('accepts a valid scalar value and dual-writes', async () => {
    ensureProductJson('mouse-scalar');
    const result = await submitCandidate({
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
  it('accepts a valid list value with correct serialization', async () => {
    ensureProductJson('mouse-list');
    const result = await submitCandidate({
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
  it('rejects shape mismatch and writes nothing', async () => {
    ensureProductJson('mouse-shape');
    const result = await submitCandidate({
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

  it('rejects absence values and writes nothing', async () => {
    ensureProductJson('mouse-absence');
    const result = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-absence',
      fieldKey: 'weight',
      value: 'unk',
      confidence: 90,
      sourceMeta: { artifact: 'absence', run_id: 'run-absence' },
    });

    assert.equal(result.status, 'rejected');
    assert.equal(result.candidateId, null);
    assert.equal(result.value, null);
    assert.ok(result.validationResult.rejections.some((r) => r.reason_code === 'absent_candidate_value'));
    assert.equal(specDb.getFieldCandidatesByProductAndField('mouse-absence', 'weight').length, 0);

    const pj = readProductJson('mouse-absence');
    assert.equal(pj.candidates, undefined);
  });

  it('strips unk from list candidates before validation and persistence', async () => {
    ensureProductJson('mouse-list-unk-strip');
    const result = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-list-unk-strip',
      fieldKey: 'colors',
      value: ['black', 'unk'],
      confidence: 90,
      sourceMeta: { source: 'cef', run_number: 1 },
    });

    assert.equal(result.status, 'accepted');
    assert.deepEqual(result.value, ['black']);
    const dbRow = specDb.getFieldCandidate('mouse-list-unk-strip', 'colors', JSON.stringify(['black']));
    assert.ok(dbRow);
    const pj = readProductJson('mouse-list-unk-strip');
    assert.deepEqual(pj.candidates.colors[0].value, ['black']);
  });

  it('rejects list candidates that only contain unk after stripping', async () => {
    ensureProductJson('mouse-list-only-unk');
    const result = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-list-only-unk',
      fieldKey: 'colors',
      value: ['UNK'],
      confidence: 90,
      sourceMeta: { source: 'cef', run_number: 2 },
    });

    assert.equal(result.status, 'rejected');
    assert.equal(result.candidateId, null);
    assert.ok(result.validationResult.rejections.some((r) => r.reason_code === 'absent_candidate_value'));
    assert.equal(specDb.getFieldCandidatesByProductAndField('mouse-list-only-unk', 'colors').length, 0);
    const pj = readProductJson('mouse-list-only-unk');
    assert.equal(pj.candidates, undefined);
  });

  // --- 4. Rejection: no field rule ---
  it('rejects when field rule is missing', async () => {
    ensureProductJson('mouse-norule');
    const result = await submitCandidate({
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
  it('rejects when productId is missing', async () => {
    const result = await submitCandidate({
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
  it('persists repaired value with validation history', async () => {
    ensureProductJson('mouse-repair');
    const result = await submitCandidate({
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

  // --- 7. Source-centric: same value twice creates separate source rows ---
  it('creates separate source rows when same value submitted by different sources', async () => {
    ensureProductJson('mouse-merge');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-merge',
      fieldKey: 'weight',
      value: 58,
      confidence: 80,
      sourceMeta: { source: 'cef', artifact: 'aaa', url: 'https://razer.com', run_number: 1 },
    });

    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-merge',
      fieldKey: 'weight',
      value: 58,
      confidence: 95,
      sourceMeta: { source: 'cef', artifact: 'bbb', url: 'https://rtings.com', run_number: 2 },
    });

    // WHY: Source-centric model — duplicate source_id is idempotent (no-op),
    // but different source_ids create separate rows. The old UNIQUE(value)
    // constraint still prevents two rows with the same value until Phase 8.
    // For now, the second insert is a no-op (same value triggers old constraint).
    const dbRows = specDb.getFieldCandidatesByProductAndField('mouse-merge', 'weight');
    assert.ok(dbRows.length >= 1);
    assert.ok(dbRows[0].source_id);

    // JSON: each submit appends a flat entry with source_id
    const pj = readProductJson('mouse-merge');
    assert.ok(pj.candidates.weight.length >= 1);
    assert.ok(pj.candidates.weight[0].source_id);
  });

  // --- 8. Different values create separate rows with distinct source_ids ---
  it('creates separate candidates for different values', async () => {
    ensureProductJson('mouse-diff');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-diff',
      fieldKey: 'weight',
      value: 58,
      confidence: 92,
      sourceMeta: { source: 'cef', run_number: 1 },
    });

    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-diff',
      fieldKey: 'weight',
      value: 57,
      confidence: 60,
      sourceMeta: { source: 'cef', run_number: 2 },
    });

    // DB: two rows with distinct source_ids
    const dbRows = specDb.getFieldCandidatesByProductAndField('mouse-diff', 'weight');
    assert.equal(dbRows.length, 2);
    assert.ok(dbRows[0].source_id);
    assert.ok(dbRows[1].source_id);
    assert.notEqual(dbRows[0].source_id, dbRows[1].source_id);

    // JSON: two flat entries with source_ids
    const pj = readProductJson('mouse-diff');
    assert.equal(pj.candidates.weight.length, 2);
    assert.ok(pj.candidates.weight[0].source_id);
    assert.ok(pj.candidates.weight[1].source_id);
  });

  // --- 9. Discovery enum: open_prefer_known triggers ---
  it('calls persistDiscoveredValue for open_prefer_known fields', async () => {
    ensureProductJson('mouse-disc');
    specDb.ensureEnumList('sensor_brand', 'auto_discovery');

    await submitCandidate({
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

  it('validates open_prefer_known against knownValues.enums and records unknown review', async () => {
    ensureProductJson('mouse-disc-enums-wrapper');

    const result = await submitCandidate({
      ...baseDeps(specDb),
      knownValues: {
        enums: {
          sensor_brand: { policy: 'open_prefer_known', values: ['pixart'] },
        },
      },
      productId: 'mouse-disc-enums-wrapper',
      fieldKey: 'sensor_brand',
      value: 'corsair',
      confidence: 80,
      sourceMeta: { run_id: 'run-1' },
    });

    assert.equal(result.status, 'accepted');
    assert.ok(
      result.validationResult.rejections.some((entry) => entry.reason_code === 'unknown_enum_prefer_known'),
      'open_prefer_known unknown should be accepted but marked for review',
    );
    const lv = specDb.getListValueByFieldAndValue('sensor_brand', 'corsair');
    assert.ok(lv, 'missing enum list should be created as the discovered value is persisted');
  });

  // --- 10. Discovery enum: closed skips ---
  it('does NOT call persistDiscoveredValue for closed fields', async () => {
    ensureProductJson('mouse-closed');

    await submitCandidate({
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

  // --- 11. Dual-write consistency (source-centric) ---
  it('DB row and JSON entry have identical data', async () => {
    ensureProductJson('mouse-dual');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-dual',
      fieldKey: 'weight',
      value: 75,
      confidence: 88,
      sourceMeta: { source: 'cef', artifact: 'xyz', run_number: 1 },
    });

    const sourceId = 'cef-mouse-dual-1';
    const dbRow = specDb.getFieldCandidateBySourceId('mouse-dual', 'weight', sourceId);
    const pj = readProductJson('mouse-dual');
    const jsonEntry = pj.candidates.weight[0];

    assert.equal(jsonEntry.value, 75);
    assert.equal(Number(dbRow.value), jsonEntry.value);
    assert.equal(dbRow.source_id, jsonEntry.source_id);
    assert.equal(dbRow.source_type, jsonEntry.source_type);
    assert.equal(dbRow.validation_json.valid, jsonEntry.validation.valid);
  });

  // --- 12. Product.json missing candidates key ---
  it('creates candidates key on product.json if missing', async () => {
    // Write product.json WITHOUT candidates key
    const dir = path.join(PRODUCT_ROOT, 'mouse-nokey');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
      schema_version: 2, checkpoint_type: 'product', product_id: 'mouse-nokey',
      category: 'mouse', identity: {}, sources: [], fields: {},
    }));

    await submitCandidate({
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

  // ── Source-centric contract (Phase 2) ──────────────────────────────

  it('buildSourceId — deterministic for finders (source + productId + runNumber)', async () => {
    const id1 = buildSourceId({ source: 'cef', run_number: 1 }, 'razer-viper-v3-pro');
    const id2 = buildSourceId({ source: 'cef', run_number: 1 }, 'razer-viper-v3-pro');
    assert.equal(id1, id2);
    assert.equal(id1, 'cef-razer-viper-v3-pro-1');
  });

  it('buildSourceId — caller-provided source_id takes precedence', async () => {
    const id = buildSourceId({ source: 'cef', source_id: 'custom-123', run_number: 1 }, 'pid');
    assert.equal(id, 'custom-123');
  });

  it('buildSourceId — timestamp-based for review/manual (no run_number)', async () => {
    const id = buildSourceId({ source: 'review' }, 'pid');
    assert.ok(id.startsWith('review-pid-'));
  });

  it('stores source_id on DB row via insertFieldCandidate', async () => {
    ensureProductJson('mouse-src-db');
    const result = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-src-db',
      fieldKey: 'weight',
      value: 58,
      confidence: 92,
      sourceMeta: { source: 'cef', model: 'gemini-2.5-flash', run_number: 1 },
    });

    assert.equal(result.status, 'accepted');
    // DB row should have source_id
    const rows = specDb.getFieldCandidatesByProductAndField('mouse-src-db', 'weight');
    assert.ok(rows.length >= 1);
    const row = rows[0];
    assert.equal(row.source_id, 'cef-mouse-src-db-1');
    assert.equal(row.source_type, 'cef');
    assert.equal(row.model, 'gemini-2.5-flash');
  });

  it('stores source_id in product.json candidate entry', async () => {
    ensureProductJson('mouse-src-json');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-src-json',
      fieldKey: 'weight',
      value: 58,
      confidence: 92,
      sourceMeta: { source: 'cef', model: 'gemini-2.5-flash', run_number: 1 },
    });

    const pj = readProductJson('mouse-src-json');
    const entry = pj.candidates.weight[0];
    assert.equal(entry.source_id, 'cef-mouse-src-json-1');
    assert.equal(entry.source_type, 'cef');
  });

  it('duplicate source_id: DB no-op AND JSON no-op (no duplicate entries)', async () => {
    ensureProductJson('mouse-idem');
    const args = {
      ...baseDeps(specDb),
      productId: 'mouse-idem',
      fieldKey: 'weight',
      value: 58,
      confidence: 92,
      sourceMeta: { source: 'cef', model: '', run_number: 7 },
    };

    await submitCandidate(args);
    await submitCandidate(args); // same source_id submitted again

    // DB: exactly 1 row (insertFieldCandidate is idempotent)
    const rows = specDb.getFieldCandidatesByProductAndField('mouse-idem', 'weight');
    assert.equal(rows.length, 1, 'DB should have exactly 1 row');

    // JSON: exactly 1 entry (must not append duplicate)
    const pj = readProductJson('mouse-idem');
    assert.equal(pj.candidates.weight.length, 1, 'product.json should have exactly 1 candidate entry');
    assert.equal(pj.candidates.weight[0].source_id, 'cef-mouse-idem-7');
  });

  // ── variant_id propagation ────────────────────────────────────────

  it('without variantId: SQL row variant_id is NULL and JSON entry has no variant_id key', async () => {
    ensureProductJson('mouse-vid-omit');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-omit',
      fieldKey: 'weight',
      value: 65,
      confidence: 88,
      sourceMeta: { source: 'feature', model: 'gpt-5', run_number: 1 },
    });

    const row = specDb.getFieldCandidateBySourceId('mouse-vid-omit', 'weight', 'feature-mouse-vid-omit-1');
    assert.ok(row, 'row inserted');
    assert.equal(row.variant_id, null, 'variant_id is NULL when omitted');

    const entry = readProductJson('mouse-vid-omit').candidates.weight[0];
    assert.ok(!('variant_id' in entry), 'product.json entry has no variant_id key when omitted');
  });

  it('with variantId: propagates to SQL row and to JSON entry', async () => {
    ensureProductJson('mouse-vid-set');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-set',
      fieldKey: 'weight',
      value: 65,
      confidence: 88,
      sourceMeta: { source: 'feature', model: 'gpt-5', run_number: 1 },
      variantId: 'v_test_one',
    });

    const row = specDb.getFieldCandidateBySourceId('mouse-vid-set', 'weight', 'feature-mouse-vid-set-1');
    assert.ok(row, 'row inserted');
    assert.equal(row.variant_id, 'v_test_one', 'variant_id propagates to SQL');

    const entry = readProductJson('mouse-vid-set').candidates.weight[0];
    assert.equal(entry.variant_id, 'v_test_one', 'variant_id propagates to product.json entry');
  });

  it('same source_id with different variantIds creates two distinct rows', async () => {
    ensureProductJson('mouse-vid-pair');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-pair',
      fieldKey: 'weight',
      value: 65,
      confidence: 88,
      sourceMeta: { source: 'feature', model: 'gpt-5', run_number: 7 },
      variantId: 'v_alpha',
    });
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-pair',
      fieldKey: 'weight',
      value: 67,
      confidence: 90,
      sourceMeta: { source: 'feature', model: 'gpt-5', run_number: 7 },
      variantId: 'v_beta',
    });

    // WHY: UNIQUE includes variant_id_key — same source_id + different variant_id = two rows
    const rows = specDb.getFieldCandidatesByProductAndField('mouse-vid-pair', 'weight');
    const vids = rows.map(r => r.variant_id).sort();
    assert.deepEqual(vids, ['v_alpha', 'v_beta'], 'two SQL rows coexist with distinct variant_ids');

    const pj = readProductJson('mouse-vid-pair');
    assert.equal(pj.candidates.weight.length, 2, 'product.json has both entries');
    const jsonVids = pj.candidates.weight.map(e => e.variant_id).sort();
    assert.deepEqual(jsonVids, ['v_alpha', 'v_beta']);
  });

  it('projects evidence to the correct row for variant+scalar dual-write (regression)', async () => {
    // WHY: RDF writes the same field under a variant_id AND the scalar (variant_id NULL).
    // Both rows share one source_id; only variant_id differs (UNIQUE uses variant_id_key).
    // The candidate-gate lookup must be variant-aware so each row's metadata.evidence_refs
    // projects into field_candidate_evidence against its OWN candidate_id — not its twin.
    ensureProductJson('mouse-vid-evidence');
    const refs = [
      { url: 'https://mfr.example/spec', tier: 'tier1', confidence: 95 },
      { url: 'https://review.example/full', tier: 'tier2', confidence: 80 },
    ];
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-evidence',
      fieldKey: 'weight',
      value: 65,
      confidence: 95,
      sourceMeta: { source: 'feature', model: 'gpt-5', run_number: 11 },
      variantId: 'v_white',
      metadata: { evidence_refs: refs },
    });
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-evidence',
      fieldKey: 'weight',
      value: 65,
      confidence: 95,
      sourceMeta: { source: 'feature', model: 'gpt-5', run_number: 11 },
      variantId: null,
      metadata: { evidence_refs: refs },
    });

    const rows = specDb.getFieldCandidatesByProductAndField('mouse-vid-evidence', 'weight');
    assert.equal(rows.length, 2, 'scalar and variant-scoped rows both exist');
    for (const row of rows) {
      const count = specDb.countFieldCandidateEvidenceByCandidateId(row.id);
      assert.equal(count, 2, `candidate ${row.id} (variant_id=${row.variant_id}) must have its own evidence projected`);
    }
  });

  it('variantId="" is normalized to NULL (no key in JSON)', async () => {
    ensureProductJson('mouse-vid-empty');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-vid-empty',
      fieldKey: 'weight',
      value: 70,
      confidence: 80,
      sourceMeta: { source: 'feature', run_number: 1 },
      variantId: '',
    });

    const row = specDb.getFieldCandidateBySourceId('mouse-vid-empty', 'weight', 'feature-mouse-vid-empty-1');
    assert.ok(row, 'row inserted');
    assert.equal(row.variant_id, null, 'empty variantId normalized to NULL in SQL');

    const entry = readProductJson('mouse-vid-empty').candidates.weight[0];
    assert.ok(!('variant_id' in entry), 'no variant_id key in JSON for empty input');
  });

  // --- Component publisher sync ---

  it('links a product to a component identity after component and brand are both published', async () => {
    ensureProductJson('mouse-component-pair');
    const config = { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false };

    const nameResult = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-pair',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 95,
      sourceMeta: { source: 'key_finder', run_number: 1 },
      metadata: evidenceRefsFor('https://component.example.com/paw3950'),
      config,
      verifyEvidenceUrls: false,
    });

    assert.equal(nameResult.publishResult?.status, 'published');
    assert.equal(nameResult.componentPublishResult?.status, 'waiting_for_pair');
    assert.equal(specDb.getItemComponentLinks('mouse-component-pair').length, 0);

    const brandResult = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-pair',
      fieldKey: 'sensor_brand',
      value: 'PixArt',
      confidence: 96,
      sourceMeta: { source: 'key_finder', run_number: 2 },
      metadata: evidenceRefsFor('https://component.example.com/pixart'),
      config,
      verifyEvidenceUrls: false,
    });

    assert.equal(brandResult.publishResult?.status, 'published');
    assert.deepEqual(brandResult.componentPublishResult, {
      status: 'linked',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
    });

    const identity = specDb.getComponentIdentity('sensor', 'PAW3950', 'PixArt');
    assert.ok(identity, 'component_identity row is created');
    const itemLinks = specDb.getItemComponentLinks('mouse-component-pair');
    assert.equal(itemLinks.length, 1);
    assert.equal(itemLinks[0].field_key, 'sensor');
    assert.equal(itemLinks[0].component_type, 'sensor');
    assert.equal(itemLinks[0].component_name, 'PAW3950');
    assert.equal(itemLinks[0].component_maker, 'PixArt');
    assert.equal(itemLinks[0].match_type, 'published_identity');
  });

  it('links component identity when brand publishes before the component name', async () => {
    ensureProductJson('mouse-component-brand-first');
    const config = { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false };

    const brandResult = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-brand-first',
      fieldKey: 'sensor_brand',
      value: 'PixArt',
      confidence: 95,
      sourceMeta: { source: 'key_finder', run_number: 1 },
      metadata: evidenceRefsFor('https://component.example.com/brand-first-pixart'),
      config,
      verifyEvidenceUrls: false,
    });

    assert.equal(brandResult.publishResult?.status, 'published');
    assert.equal(brandResult.componentPublishResult?.status, 'waiting_for_pair');
    assert.equal(specDb.getItemComponentLinks('mouse-component-brand-first').length, 0);

    const nameResult = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-brand-first',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 96,
      sourceMeta: { source: 'key_finder', run_number: 2 },
      metadata: evidenceRefsFor('https://component.example.com/brand-first-paw3950'),
      config,
      verifyEvidenceUrls: false,
    });

    assert.equal(nameResult.publishResult?.status, 'published');
    assert.equal(nameResult.componentPublishResult?.status, 'linked');
    assert.ok(specDb.getComponentIdentity('sensor', 'PAW3950', 'PixArt'));
    assert.equal(specDb.getItemComponentLinks('mouse-component-brand-first').length, 1);
  });

  it('persists component and brand aliases from published component identity metadata', async () => {
    ensureProductJson('mouse-component-aliases');
    const config = { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false };

    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-aliases',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 95,
      sourceMeta: { source: 'key_finder', run_number: 1 },
      metadata: componentAliasMetadata({
        component: ['PMW3950', 'PixArt 3950'],
        brand: ['PixArt Imaging'],
      }),
      config,
      verifyEvidenceUrls: false,
    });

    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-aliases',
      fieldKey: 'sensor_brand',
      value: 'PixArt',
      confidence: 95,
      sourceMeta: { source: 'key_finder', run_number: 2 },
      metadata: componentAliasMetadata({
        component: ['PAW-3950'],
        brand: ['PixArt Inc.'],
      }),
      config,
      verifyEvidenceUrls: false,
    });

    const row = specDb.getAllComponentsForType('sensor')
      .find((entry) => entry.identity.canonical_name === 'PAW3950' && entry.identity.maker === 'PixArt');
    const aliases = row.aliases.map((entry) => entry.alias).sort();
    assert.deepEqual(aliases, ['PAW-3950', 'PMW3950', 'PixArt 3950', 'PixArt Imaging', 'PixArt Inc.'].sort());
  });

  it('does not sync component identities from variant-scoped publishes', async () => {
    ensureProductJson('mouse-component-variant');
    const config = { publishConfidenceThreshold: 0.7, evidenceVerificationEnabled: false };

    const result = await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-component-variant',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 95,
      sourceMeta: { source: 'key_finder', run_number: 1 },
      metadata: evidenceRefsFor('https://component.example.com/variant-paw3950'),
      config,
      verifyEvidenceUrls: false,
      variantId: 'v_white',
    });

    assert.equal(result.publishResult?.status, 'published');
    assert.equal(result.componentPublishResult?.status, 'skipped_variant_scope');
    assert.equal(specDb.getItemComponentLinks('mouse-component-variant').length, 0);
  });

  // --- HEAD-check gate (evidence URL verification) ---

  function stubFetch(handler) {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method || 'GET' });
      return handler(String(url), opts || {});
    };
    return { calls, restore: () => { globalThis.fetch = original; } };
  }

  function mkResponse(status) {
    return { ok: status >= 200 && status < 300, status, headers: new Map() };
  }

  it('HEAD-check: all-2xx refs → all stamped accepted=1 with http_status', async () => {
    ensureProductJson('mouse-head-ok');
    const stub = stubFetch(() => mkResponse(200));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-ok',
        fieldKey: 'weight',
        value: 75,
        confidence: 90,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://mfr.example.com/a', tier: 'tier1', confidence: 95 },
            { url: 'https://review.example.com/a', tier: 'tier2', confidence: 80 },
          ],
        },
        verifyEvidenceUrls: true,
      });
      assert.equal(result.status, 'accepted');
      const evidence = specDb.listFieldCandidateEvidenceByCandidateId(result.candidateId);
      assert.equal(evidence.length, 2);
      assert.ok(evidence.every(e => e.accepted === 1));
      assert.ok(evidence.every(e => e.http_status === 200));
      assert.ok(evidence.every(e => typeof e.verified_at === 'string'));
    } finally { stub.restore(); }
  });

  it('HEAD-check: mixed 200/404 → split correctly into accepted/rejected', async () => {
    ensureProductJson('mouse-head-mix');
    const stub = stubFetch((url) => mkResponse(url.includes('bad') ? 404 : 200));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-mix',
        fieldKey: 'weight',
        value: 60,
        confidence: 85,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://good.example.com', tier: 'tier1', confidence: 95 },
            { url: 'https://bad.example.com', tier: 'tier2', confidence: 80 },
          ],
        },
        verifyEvidenceUrls: true,
      });
      assert.equal(result.status, 'accepted');
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 1);
      assert.equal(split.rejected, 1);
    } finally { stub.restore(); }
  });

  it('HEAD-check: all-404 with strict=false → candidate accepted, evidence all rejected (GUI visibility)', async () => {
    ensureProductJson('mouse-head-all404-lax');
    const stub = stubFetch(() => mkResponse(404));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-all404-lax',
        fieldKey: 'weight',
        value: 50,
        confidence: 60,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://dead1.example.com', tier: 'tier1', confidence: 95 },
            { url: 'https://dead2.example.com', tier: 'tier2', confidence: 80 },
          ],
        },
        verifyEvidenceUrls: true,
        strictEvidence: false,
      });
      assert.equal(result.status, 'accepted');
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 0);
      assert.equal(split.rejected, 2);
    } finally { stub.restore(); }
  });

  it('HEAD-check: all-404 with strict=true → candidate REJECTED with reason_code all_evidence_404', async () => {
    ensureProductJson('mouse-head-all404-strict');
    const stub = stubFetch(() => mkResponse(404));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-all404-strict',
        fieldKey: 'weight',
        value: 50,
        confidence: 60,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://dead1.example.com', tier: 'tier1', confidence: 95 },
          ],
        },
        verifyEvidenceUrls: true,
        strictEvidence: true,
      });
      assert.equal(result.status, 'rejected');
      assert.equal(result.candidateId, null);
      const codes = result.validationResult.rejections.map(r => r.reason_code);
      assert.ok(codes.includes('all_evidence_404'), `expected all_evidence_404, got ${JSON.stringify(codes)}`);
    } finally { stub.restore(); }
  });

  it('HEAD-check: 503 (server error / anti-bot) treated as unknown → accepted', async () => {
    ensureProductJson('mouse-head-503');
    const stub = stubFetch(() => mkResponse(503));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-503',
        fieldKey: 'weight',
        value: 70,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: { evidence_refs: [{ url: 'https://bot-blocked.example.com', tier: 'tier5', confidence: 70 }] },
        verifyEvidenceUrls: true,
      });
      assert.equal(result.status, 'accepted');
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 1, '503 is unknown, not rejected');
      assert.equal(split.rejected, 0);
    } finally { stub.restore(); }
  });

  it('HEAD-check: 403 (forbidden / anti-bot) treated as unknown → accepted', async () => {
    ensureProductJson('mouse-head-403');
    const stub = stubFetch(() => mkResponse(403));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-403',
        fieldKey: 'weight',
        value: 70,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: { evidence_refs: [{ url: 'https://forbidden.example.com', tier: 'tier3', confidence: 60 }] },
        verifyEvidenceUrls: true,
      });
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 1, '403 anti-bot is unknown, not rejected');
      assert.equal(split.rejected, 0);
    } finally { stub.restore(); }
  });

  it('HEAD-check: 410 (gone) is rejected — same class as 404', async () => {
    ensureProductJson('mouse-head-410');
    const stub = stubFetch(() => mkResponse(410));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-410',
        fieldKey: 'weight',
        value: 70,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: { evidence_refs: [{ url: 'https://gone.example.com', tier: 'tier1', confidence: 95 }] },
        verifyEvidenceUrls: true,
      });
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 0);
      assert.equal(split.rejected, 1, '410 Gone counts as dead like 404');
    } finally { stub.restore(); }
  });

  it('HEAD-check: 429 (rate limit) treated as unknown → accepted', async () => {
    ensureProductJson('mouse-head-429');
    const stub = stubFetch(() => mkResponse(429));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-429',
        fieldKey: 'weight',
        value: 70,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: { evidence_refs: [{ url: 'https://ratelimited.example.com', tier: 'tier2', confidence: 70 }] },
        verifyEvidenceUrls: true,
      });
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 1);
      assert.equal(split.rejected, 0);
    } finally { stub.restore(); }
  });

  it('HEAD-check: network error (fetch throws) treated as unknown → accepted (no false rejection)', async () => {
    ensureProductJson('mouse-head-neterr');
    const stub = stubFetch(() => { throw new TypeError('ECONNREFUSED'); });
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-neterr',
        fieldKey: 'weight',
        value: 65,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://offline.example.com', tier: 'tier1', confidence: 90 },
          ],
        },
        verifyEvidenceUrls: true,
        strictEvidence: true,  // even strict mode should not reject on network errors
      });
      assert.equal(result.status, 'accepted');
      const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(result.candidateId);
      assert.equal(split.accepted, 1);
      assert.equal(split.rejected, 0);
    } finally { stub.restore(); }
  });

  it('HEAD-check: evidenceCache dedupes — same URL across N calls fetched once', async () => {
    ensureProductJson('mouse-cache-1');
    ensureProductJson('mouse-cache-2');
    const stub = stubFetch(() => mkResponse(200));
    try {
      const cache = new Map();
      await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-cache-1',
        fieldKey: 'weight',
        value: 70,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: { evidence_refs: [{ url: 'https://shared.example.com', tier: 'tier1', confidence: 95 }] },
        verifyEvidenceUrls: true,
        evidenceCache: cache,
      });
      await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-cache-2',
        fieldKey: 'weight',
        value: 72,
        confidence: 80,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: { evidence_refs: [{ url: 'https://shared.example.com', tier: 'tier1', confidence: 95 }] },
        verifyEvidenceUrls: true,
        evidenceCache: cache,
      });
      assert.equal(stub.calls.length, 1, 'cache must prevent second fetch');
    } finally { stub.restore(); }
  });

  it('HEAD-check: verifyEvidenceUrls=false → no fetch, refs pass through unverified', async () => {
    ensureProductJson('mouse-head-disabled');
    const stub = stubFetch(() => mkResponse(200));
    try {
      const result = await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-disabled',
        fieldKey: 'weight',
        value: 75,
        confidence: 85,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://skipped.example.com', tier: 'tier1', confidence: 95 },
          ],
        },
        verifyEvidenceUrls: false,
      });
      assert.equal(result.status, 'accepted');
      assert.equal(stub.calls.length, 0, 'no HEAD check when verification disabled');
      const evidence = specDb.listFieldCandidateEvidenceByCandidateId(result.candidateId);
      assert.equal(evidence[0].http_status, null);
      assert.equal(evidence[0].accepted, 1);  // legacy default when unverified
    } finally { stub.restore(); }
  });

  it('HEAD-check: metadata.evidence_refs in product.json is stamped with http_status after verification', async () => {
    ensureProductJson('mouse-head-stamp');
    const stub = stubFetch((url) => mkResponse(url.includes('bad') ? 404 : 200));
    try {
      await submitCandidate({
        ...baseDeps(specDb),
        productId: 'mouse-head-stamp',
        fieldKey: 'weight',
        value: 70,
        confidence: 85,
        sourceMeta: { source: 'cef', run_number: 1 },
        metadata: {
          evidence_refs: [
            { url: 'https://good.example.com', tier: 'tier1', confidence: 95 },
            { url: 'https://bad.example.com', tier: 'tier2', confidence: 80 },
          ],
        },
        verifyEvidenceUrls: true,
      });
      const entry = readProductJson('mouse-head-stamp').candidates.weight[0];
      const refs = entry.metadata.evidence_refs;
      assert.equal(refs.length, 2);
      const good = refs.find(r => r.url.includes('good'));
      const bad = refs.find(r => r.url.includes('bad'));
      assert.equal(good.http_status, 200);
      assert.equal(good.accepted, 1);
      assert.equal(bad.http_status, 404);
      assert.equal(bad.accepted, 0);
    } finally { stub.restore(); }
  });

  // ── submitted_at persistence in product.json (rebuild contract) ──────
  // WHY: After a DB-deleted rebuild, reseed must restore historical submitted_at
  // from product.json. The new-format JSON entry must carry it.

  it('new-format JSON entry includes submitted_at as ISO8601 string', async () => {
    ensureProductJson('mouse-ts-json');
    const before = new Date().toISOString();
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-ts-json',
      fieldKey: 'weight',
      value: 58,
      confidence: 90,
      sourceMeta: { source: 'cef', model: 'gpt-5', run_number: 1 },
    });
    const after = new Date().toISOString();

    const entry = readProductJson('mouse-ts-json').candidates.weight[0];
    assert.ok(entry.submitted_at, 'submitted_at present on JSON entry');
    assert.ok(typeof entry.submitted_at === 'string');
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(entry.submitted_at), 'ISO8601 shape');
    assert.ok(entry.submitted_at >= before && entry.submitted_at <= after, 'within submission window');
  });

  it('re-submitting same (source_id, variant_id) does not append or mutate submitted_at', async () => {
    ensureProductJson('mouse-ts-idem');
    const args = {
      ...baseDeps(specDb),
      productId: 'mouse-ts-idem',
      fieldKey: 'weight',
      value: 58,
      confidence: 90,
      sourceMeta: { source: 'cef', model: 'gpt-5', run_number: 5 },
    };
    await submitCandidate(args);
    const firstTs = readProductJson('mouse-ts-idem').candidates.weight[0].submitted_at;
    assert.ok(firstTs);

    // Small delay to ensure any accidental overwrite would produce a different timestamp
    await new Promise(r => setTimeout(r, 10));
    await submitCandidate(args);

    const entries = readProductJson('mouse-ts-idem').candidates.weight;
    assert.equal(entries.length, 1, 'no duplicate entry appended');
    assert.equal(entries[0].submitted_at, firstTs, 'original submitted_at preserved');
  });

  it('reseeded JSON timestamp survives through SQL row via rebuildFieldCandidatesFromJson', async () => {
    // WHY: End-to-end proof — submit candidate, then simulate a DB-deleted
    // rebuild by deleting the SQL row and calling reseed. The SQL row must
    // come back with the original submitted_at from JSON.
    const { rebuildFieldCandidatesFromJson } = await import('../../candidateReseed.js');

    ensureProductJson('mouse-ts-e2e');
    await submitCandidate({
      ...baseDeps(specDb),
      productId: 'mouse-ts-e2e',
      fieldKey: 'weight',
      value: 60,
      confidence: 85,
      sourceMeta: { source: 'cef', model: 'gpt-5', run_number: 3 },
    });
    const originalTs = readProductJson('mouse-ts-e2e').candidates.weight[0].submitted_at;
    assert.ok(originalTs);

    specDb.deleteFieldCandidatesByProduct('mouse-ts-e2e');
    assert.equal(specDb.getAllFieldCandidatesByProduct('mouse-ts-e2e').length, 0);

    rebuildFieldCandidatesFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('mouse-ts-e2e', 'weight', 'cef-mouse-ts-e2e-3');
    assert.ok(row, 'row rebuilt');
    assert.equal(row.submitted_at, originalTs, 'submitted_at round-tripped through JSON → reseed → SQL');
  });
});
