import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { deleteCandidateBySourceId, deleteAllCandidatesForField } from '../deleteCandidate.js';

function withFreshEnv(fn) {
  return () => {
    const root = path.join('.tmp', `_test_delcand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
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

    let _ctr = 0;
    function seed(productId, fieldKey, value, confidence, sourceType = 'cef') {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const sid = `${sourceType}-${productId}-${++_ctr}`;
      specDb.insertFieldCandidate({
        productId, fieldKey, value: serialized,
        sourceId: sid, sourceType, model: 'test-model',
        confidence,
        validationJson: { valid: true, repairs: [], rejections: [] },
        metadataJson: {}, status: 'candidate',
      });
      return sid;
    }

    try {
      fn({ specDb, root, ensureProductJson, readProductJson, seed });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

const baseOpts = (specDb, root, productId = 'mouse-001') => ({
  specDb, category: 'mouse', productId, fieldKey: 'weight',
  config: {}, productRoot: root,
});

describe('deleteCandidateBySourceId', () => {

  it('deletes SQL row + product.json candidate — fields unchanged', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    const sid1 = seed('mouse-001', 'weight', '58', 0.9);
    const sid2 = seed('mouse-001', 'weight', '60', 0.85);
    const seededField = { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] };
    ensureProductJson('mouse-001', {
      candidates: { weight: [
        { source_id: sid1, source_type: 'cef', value: '58', confidence: 0.9 },
        { source_id: sid2, source_type: 'cef', value: '60', confidence: 0.85 },
      ] },
      fields: { weight: seededField },
    });

    const result = deleteCandidateBySourceId({ ...baseOpts(specDb, root), sourceId: sid1 });
    assert.equal(result.deleted, true);
    // WHY: Candidate deletion never touches published fields (policy shift)
    assert.equal(result.republished, false);

    // SQL row gone
    assert.equal(specDb.getFieldCandidateBySourceId('mouse-001', 'weight', sid1), null);
    // product.json candidate entry removed
    const pj = readProductJson('mouse-001');
    assert.equal(pj.candidates.weight.length, 1);
    assert.equal(pj.candidates.weight[0].source_id, sid2);
    // Field UNCHANGED — candidate deletion does not republish
    assert.deepEqual(pj.fields.weight, seededField);
  }));

  it('only candidate for field → field still exists (not unpublished)', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    const sid = seed('mouse-001', 'weight', '58', 0.9);
    const seededField = { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] };
    ensureProductJson('mouse-001', {
      candidates: { weight: [{ source_id: sid, source_type: 'cef', value: '58', confidence: 0.9 }] },
      fields: { weight: seededField },
    });

    const result = deleteCandidateBySourceId({ ...baseOpts(specDb, root), sourceId: sid });
    assert.equal(result.deleted, true);
    assert.equal(result.republished, false);

    const pj = readProductJson('mouse-001');
    assert.deepEqual(pj.candidates.weight, []);
    // WHY: Published field persists — source deletion handles unpublish, not candidate deletion
    assert.deepEqual(pj.fields.weight, seededField);
  }));

  it('manual_override last source_id globally → artifacts_cleaned false (no artifacts exist)', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    const sid = seed('mouse-001', 'weight', '58', 0.9, 'manual_override');
    ensureProductJson('mouse-001', {
      candidates: { weight: [{ source_id: sid, source_type: 'manual_override', value: '58', confidence: 0.9 }] },
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    const result = deleteCandidateBySourceId({ ...baseOpts(specDb, root), sourceId: sid });
    // WHY: manual_override has no artifacts — cross-field count reaches 0 but nothing to clean
    assert.equal(result.artifacts_cleaned, false);
  }));

  it('other fields still reference source_id → artifacts_cleaned false', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    // Same source_id in both colors and editions (like a CEF run)
    const sid = 'cef-mouse-001-shared';
    specDb.insertFieldCandidate({
      productId: 'mouse-001', fieldKey: 'colors', sourceId: sid, sourceType: 'cef',
      value: '["black"]', confidence: 0.9, model: '', validationJson: {}, metadataJson: {},
    });
    specDb.insertFieldCandidate({
      productId: 'mouse-001', fieldKey: 'editions', sourceId: sid, sourceType: 'cef',
      value: '["standard"]', confidence: 0.9, model: '', validationJson: {}, metadataJson: {},
    });
    ensureProductJson('mouse-001', {
      candidates: {
        colors: [{ source_id: sid, source_type: 'cef', value: '["black"]', confidence: 0.9 }],
        editions: [{ source_id: sid, source_type: 'cef', value: '["standard"]', confidence: 0.9 }],
      },
      fields: {
        colors: { value: ['black'], confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
        editions: { value: ['standard'], confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
      },
    });

    const result = deleteCandidateBySourceId({
      ...baseOpts(specDb, root), fieldKey: 'colors', sourceId: sid,
    });
    assert.equal(result.artifacts_cleaned, false);
    // editions row still exists
    assert.equal(specDb.countFieldCandidatesBySourceId('mouse-001', sid), 1);
  }));

  it('manual/review source_type → no-op cascade (artifacts_cleaned false)', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    const sid = seed('mouse-001', 'weight', '58', 0.9, 'manual_override');
    ensureProductJson('mouse-001', {
      candidates: { weight: [{ source_id: sid, source_type: 'manual_override', value: '58', confidence: 0.9 }] },
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    // Should not throw — manual_override has no artifacts to clean
    const result = deleteCandidateBySourceId({ ...baseOpts(specDb, root), sourceId: sid });
    assert.equal(result.deleted, true);
    assert.equal(result.artifacts_cleaned, false);
  }));

  it('CEF last source_id → candidate self-isolated, source artifacts untouched', withFreshEnv(({ specDb, root, ensureProductJson }) => {
    const productId = 'mouse-cef-cascade';
    const runNumber = 1;
    const sid = `cef-${productId}-${runNumber}`;

    // Seed a CEF finder run in SQL (the way the real CEF finder does)
    const finderStore = specDb.getFinderStore('colorEditionFinder');
    finderStore.upsert({
      category: 'mouse', product_id: productId,
      cooldown_until: '', latest_ran_at: new Date().toISOString(), run_count: 1,
    });
    finderStore.insertRun({
      category: 'mouse', product_id: productId, run_number: runNumber,
      ran_at: new Date().toISOString(), model: 'test', fallback_used: 0,
      effort_level: 'standard', access_mode: 'direct', cooldown_until: '',
      selected_json: '{}', prompt_json: '{}', response_json: '{}',
    });

    // Seed finder JSON file
    const cefJsonPath = path.join(root, productId, 'color_edition.json');
    fs.mkdirSync(path.join(root, productId), { recursive: true });
    fs.writeFileSync(cefJsonPath, JSON.stringify({
      product_id: productId, category: 'mouse',
      selected: { colors: ['black'], editions: {}, default_color: 'black' },
      cooldown_until: '', last_ran_at: new Date().toISOString(),
      run_count: 1, next_run_number: 2,
      runs: [{ run_number: 1, model: 'test', selected: { colors: ['black'] } }],
    }, null, 2));

    // Seed the candidate row
    specDb.insertFieldCandidate({
      productId, fieldKey: 'colors', sourceId: sid, sourceType: 'cef',
      value: '["black"]', confidence: 0.9, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    ensureProductJson(productId, {
      candidates: { colors: [{ source_id: sid, source_type: 'cef', value: '["black"]', confidence: 0.9 }] },
      fields: { colors: { value: ['black'], confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    // Act: delete the candidate
    const result = deleteCandidateBySourceId({
      specDb, category: 'mouse', productId, fieldKey: 'colors', sourceId: sid,
      config: {}, productRoot: root,
    });

    assert.equal(result.deleted, true);
    // WHY: Candidates are self-isolated — they never touch their source's artifacts
    assert.equal(result.artifacts_cleaned, false);

    // Verify: finder SQL run row STILL EXISTS (source untouched)
    const remainingRuns = finderStore.listRuns(productId);
    assert.equal(remainingRuns.length, 1);

    // Verify: finder summary row STILL EXISTS
    const summaryRow = finderStore.get(productId);
    assert.ok(summaryRow, 'summary row must survive candidate deletion');

    // Verify: finder JSON file STILL EXISTS
    assert.equal(fs.existsSync(cefJsonPath), true);
  }));

  it('CEF cascade with remaining runs preserves custom summary columns', withFreshEnv(({ specDb, root, ensureProductJson }) => {
    const productId = 'mouse-cef-preserve';
    const sid1 = `cef-${productId}-1`;

    // Seed CEF summary WITH custom columns (colors, editions, variant_registry)
    const finderStore = specDb.getFinderStore('colorEditionFinder');
    finderStore.upsert({
      category: 'mouse', product_id: productId,
      colors: ['black', 'white'], editions: ['special-ed'],
      default_color: 'black',
      variant_registry: [{ variant_id: 'v_aabbccdd', variant_key: 'color:black', variant_type: 'color' }],
      cooldown_until: '2026-05-01', latest_ran_at: '2026-04-14T00:00:00Z', run_count: 2,
    });

    // Seed 2 finder SQL runs
    for (const rn of [1, 2]) {
      finderStore.insertRun({
        category: 'mouse', product_id: productId, run_number: rn,
        ran_at: '2026-04-14T00:00:00Z', model: 'test', fallback_used: 0,
        effort_level: 'standard', access_mode: 'direct', cooldown_until: '',
        selected: { colors: ['black', 'white'], editions: { 'special-ed': {} }, default_color: 'black' },
        prompt: {}, response: {},
      });
    }

    // Seed finder JSON with 2 runs
    const cefJsonPath = path.join(root, productId, 'color_edition.json');
    fs.mkdirSync(path.join(root, productId), { recursive: true });
    fs.writeFileSync(cefJsonPath, JSON.stringify({
      product_id: productId, category: 'mouse',
      selected: { colors: ['black', 'white'], editions: { 'special-ed': {} }, default_color: 'black' },
      variant_registry: [{ variant_id: 'v_aabbccdd', variant_key: 'color:black', variant_type: 'color' }],
      cooldown_until: '2026-05-01', last_ran_at: '2026-04-14T00:00:00Z',
      run_count: 2, next_run_number: 3,
      runs: [
        { run_number: 1, model: 'test', selected: { colors: ['black', 'white'] } },
        { run_number: 2, model: 'test', selected: { colors: ['black', 'white'] } },
      ],
    }, null, 2));

    // Seed candidate for run 1 only (run 2 has a separate source_id)
    specDb.insertFieldCandidate({
      productId, fieldKey: 'colors', sourceId: sid1, sourceType: 'cef',
      value: '["black","white"]', confidence: 0.9, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    ensureProductJson(productId, {
      candidates: { colors: [{ source_id: sid1, source_type: 'cef', value: '["black","white"]', confidence: 0.9 }] },
      fields: { colors: { value: ['black', 'white'], confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    // Act: delete run 1's candidate — cascade should update summary but preserve custom cols
    const result = deleteCandidateBySourceId({
      specDb, category: 'mouse', productId, fieldKey: 'colors', sourceId: sid1,
      config: {}, productRoot: root,
    });

    assert.equal(result.deleted, true);
    // WHY: Candidates are self-isolated — no upward cascade to source artifacts
    assert.equal(result.artifacts_cleaned, false);

    // Verify: ALL runs STILL EXIST (source untouched)
    const remainingRuns = finderStore.listRuns(productId);
    assert.equal(remainingRuns.length, 2, 'both runs must survive candidate deletion');

    // Verify: summary row completely unchanged
    const summaryRow = finderStore.get(productId);
    assert.ok(summaryRow, 'summary row must still exist');
    assert.deepEqual(summaryRow.colors, ['black', 'white'], 'colors must be preserved');
    assert.deepEqual(summaryRow.editions, ['special-ed'], 'editions must be preserved');
    assert.equal(summaryRow.run_count, 2, 'run_count must be unchanged');
  }));

  it('variant-owned colors field unchanged after candidate deletion', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    const sid = seed('mouse-001', 'colors', '["black","white"]', 0.95, 'cef');
    const seededField = { value: ['black', 'white'], confidence: 1.0, source: 'variant_registry', sources: [{ source: 'variant_registry' }] };
    ensureProductJson('mouse-001', {
      candidates: { colors: [{ source_id: sid, source_type: 'cef', value: '["black","white"]', confidence: 0.95 }] },
      fields: { colors: seededField },
    });

    const result = deleteCandidateBySourceId({
      specDb, category: 'mouse', productId: 'mouse-001', fieldKey: 'colors',
      sourceId: sid, config: {}, productRoot: root,
    });
    assert.equal(result.deleted, true);
    assert.equal(result.republished, false);

    const pj = readProductJson('mouse-001');
    // WHY: Variant-owned field must survive candidate deletion — this is the cross-surface bug fix
    assert.deepEqual(pj.fields.colors, seededField, 'variant-owned colors unchanged');
    assert.equal(specDb.getFieldCandidateBySourceId('mouse-001', 'colors', sid), null, 'SQL candidate gone');
    assert.deepEqual(pj.candidates.colors, [], 'JSON candidate entry gone');
  }));

  it('non-existent candidate → deleted false', withFreshEnv(({ specDb, root, ensureProductJson }) => {
    ensureProductJson('mouse-001', {});
    const result = deleteCandidateBySourceId({
      ...baseOpts(specDb, root), sourceId: 'nonexistent-sid',
    });
    assert.equal(result.deleted, false);
    assert.equal(result.republished, false);
    assert.equal(result.artifacts_cleaned, false);
  }));
});

describe('deleteAllCandidatesForField', () => {

  it('bulk deletes all candidates — field persists', withFreshEnv(({ specDb, root, ensureProductJson, readProductJson, seed }) => {
    const sid1 = seed('mouse-001', 'weight', '58', 0.9);
    const sid2 = seed('mouse-001', 'weight', '60', 0.85, 'manual_override');
    const seededField = { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] };
    ensureProductJson('mouse-001', {
      candidates: { weight: [
        { source_id: sid1, source_type: 'cef', value: '58', confidence: 0.9 },
        { source_id: sid2, source_type: 'manual_override', value: '60', confidence: 0.85 },
      ] },
      fields: { weight: seededField },
    });

    const result = deleteAllCandidatesForField({ ...baseOpts(specDb, root) });
    assert.equal(result.deleted, 2);

    const pj = readProductJson('mouse-001');
    assert.equal(pj.candidates.weight, undefined);
    // WHY: Published field persists — source deletion handles unpublish, not candidate deletion
    assert.deepEqual(pj.fields.weight, seededField);

    // SQL rows all gone
    assert.equal(specDb.getFieldCandidatesByProductAndField('mouse-001', 'weight').length, 0);
  }));

  it('shared source with another field → artifacts kept for shared source', withFreshEnv(({ specDb, root, ensureProductJson, seed }) => {
    const sharedSid = 'cef-mouse-001-shared2';
    specDb.insertFieldCandidate({
      productId: 'mouse-001', fieldKey: 'colors', sourceId: sharedSid, sourceType: 'cef',
      value: '["black"]', confidence: 0.9, model: '', validationJson: {}, metadataJson: {},
    });
    specDb.insertFieldCandidate({
      productId: 'mouse-001', fieldKey: 'editions', sourceId: sharedSid, sourceType: 'cef',
      value: '["standard"]', confidence: 0.9, model: '', validationJson: {}, metadataJson: {},
    });
    const soloSid = seed('mouse-001', 'colors', '["red"]', 0.8, 'manual_override');
    ensureProductJson('mouse-001', {
      candidates: {
        colors: [
          { source_id: sharedSid, source_type: 'cef', value: '["black"]', confidence: 0.9 },
          { source_id: soloSid, source_type: 'manual_override', value: '["red"]', confidence: 0.8 },
        ],
        editions: [{ source_id: sharedSid, source_type: 'cef', value: '["standard"]', confidence: 0.9 }],
      },
      fields: {
        colors: { value: ['black', 'red'], confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
        editions: { value: ['standard'], confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
      },
    });

    const result = deleteAllCandidatesForField({
      ...baseOpts(specDb, root), fieldKey: 'colors',
    });
    assert.equal(result.deleted, 2);
    // Shared source still has editions row → not fully cleaned
    assert.equal(specDb.countFieldCandidatesBySourceId('mouse-001', sharedSid), 1);
    // Solo source fully cleaned
    assert.equal(specDb.countFieldCandidatesBySourceId('mouse-001', soloSid), 0);
  }));

  it('no candidates for field → deleted 0', withFreshEnv(({ specDb, root, ensureProductJson }) => {
    ensureProductJson('mouse-001', {});
    const result = deleteAllCandidatesForField({ ...baseOpts(specDb, root) });
    assert.equal(result.deleted, 0);
    assert.equal(result.artifacts_cleaned, false);
  }));
});
