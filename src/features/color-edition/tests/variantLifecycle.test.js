import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { derivePublishedFromVariants, deleteVariant } from '../variantLifecycle.js';

function withEnv(fn) {
  return () => {
    const root = path.join('.tmp', `_test_vlife_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(root, { recursive: true });
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

    function ensureProductJson(productId, data = {}) {
      const dir = path.join(root, productId);
      fs.mkdirSync(dir, { recursive: true });
      const base = {
        schema_version: 2, product_id: productId, category: 'mouse',
        identity: { brand: 'Test', model: 'Test' },
        sources: [], fields: {}, candidates: {},
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...data,
      };
      fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(base, null, 2));
    }

    function readProductJson(productId) {
      try { return JSON.parse(fs.readFileSync(path.join(root, productId, 'product.json'), 'utf8')); }
      catch { return null; }
    }

    function ensureCefJson(productId, data) {
      const dir = path.join(root, productId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'color_edition.json'), JSON.stringify(data, null, 2));
    }

    function readCefJson(productId) {
      try { return JSON.parse(fs.readFileSync(path.join(root, productId, 'color_edition.json'), 'utf8')); }
      catch { return null; }
    }

    function ensurePifJson(productId, data) {
      const dir = path.join(root, productId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'product_images.json'), JSON.stringify(data, null, 2));
    }

    function readPifJson(productId) {
      try { return JSON.parse(fs.readFileSync(path.join(root, productId, 'product_images.json'), 'utf8')); }
      catch { return null; }
    }

    try {
      fn({ specDb, root, ensureProductJson, readProductJson, ensureCefJson, readCefJson, ensurePifJson, readPifJson });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

const PID = 'mouse-lifecycle';

function seedVariants(specDb) {
  specDb.variants.syncFromRegistry(PID, [
    { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
    { variant_id: 'v_bb', variant_key: 'color:white', variant_type: 'color', variant_label: 'White', color_atoms: ['white'], created_at: '2026-04-14T00:00:00Z' },
    { variant_id: 'v_cc', variant_key: 'edition:special-ed', variant_type: 'edition', variant_label: 'Special Edition', color_atoms: ['olive', 'khaki'], edition_slug: 'special-ed', edition_display_name: 'Special Edition', created_at: '2026-04-14T00:00:00Z' },
  ]);
}

function seedCefSummary(specDb) {
  specDb.getFinderStore('colorEditionFinder').upsert({
    category: 'mouse', product_id: PID,
    colors: ['black', 'white', 'olive', 'khaki'], editions: ['special-ed'],
    default_color: 'black', variant_registry: [],
    latest_ran_at: '2026-04-14T00:00:00Z', run_count: 1,
  });
}

// ── derivePublishedFromVariants ──────────────────────────────────────

describe('derivePublishedFromVariants', () => {

  it('active color variants → published colors includes their atoms', withEnv(({ specDb, root, ensureProductJson, readProductJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);

    const result = derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    assert.ok(result.colors.includes('black'));
    assert.ok(result.colors.includes('white'));
  }));

  it('active edition variants → editions includes slugs, atoms stay scoped to edition', withEnv(({ specDb, root, ensureProductJson, readProductJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);

    const result = derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    assert.ok(result.editions.includes('special-ed'));
    // WHY: Edition combo atoms describe the edition's colorway — they must NOT
    // be promoted to standalone published colors.
    assert.ok(!result.colors.includes('olive'), 'edition atoms must NOT leak into published colors');
    assert.ok(!result.colors.includes('khaki'), 'edition atoms must NOT leak into published colors');
  }));

  it('edition-only product → empty colors, populated editions', withEnv(({ specDb, root, ensureProductJson }) => {
    specDb.variants.syncFromRegistry(PID, [
      { variant_id: 'v_ed', variant_key: 'edition:limited-ed', variant_type: 'edition', variant_label: 'Limited', color_atoms: ['red', 'gold'], edition_slug: 'limited-ed', edition_display_name: 'Limited', created_at: '2026-04-14T00:00:00Z' },
    ]);
    seedCefSummary(specDb);
    ensureProductJson(PID);

    const result = derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    assert.deepEqual(result.colors, [], 'no standalone color variants → empty colors');
    assert.deepEqual(result.editions, ['limited-ed']);
  }));

  it('retired variants excluded from published', withEnv(({ specDb, root, ensureProductJson, readProductJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    specDb.variants.retire(PID, 'v_bb'); // retire white
    ensureProductJson(PID);

    const result = derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    assert.ok(!result.colors.includes('white'), 'retired variant excluded');
    assert.ok(result.colors.includes('black'), 'active variant included');
  }));

  it('no variants → empty published + fields deleted from product.json', withEnv(({ specDb, root, ensureProductJson, readProductJson }) => {
    seedCefSummary(specDb);
    ensureProductJson(PID, { fields: { colors: { value: ['old'] }, editions: { value: ['old'] } } });

    const result = derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    assert.deepEqual(result.colors, []);
    assert.deepEqual(result.editions, []);

    const pj = readProductJson(PID);
    assert.equal(pj.fields.colors, undefined, 'empty colors field deleted');
    assert.equal(pj.fields.editions, undefined, 'empty editions field deleted');
  }));

  it('product.json fields updated with variant-derived values', withEnv(({ specDb, root, ensureProductJson, readProductJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);

    derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    const pj = readProductJson(PID);
    assert.ok(pj.fields.colors, 'colors field exists');
    assert.equal(pj.fields.colors.source, 'variant_registry');
    assert.ok(pj.fields.colors.value.includes('black'));
    assert.ok(!pj.fields.colors.value.includes('olive'), 'edition atoms must NOT be in product.json colors');
    assert.ok(!pj.fields.colors.value.includes('khaki'), 'edition atoms must NOT be in product.json colors');
    assert.ok(pj.fields.editions.value.includes('special-ed'));
  }));

  it('CEF summary columns updated', withEnv(({ specDb, root, ensureProductJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);

    derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    const summary = specDb.getFinderStore('colorEditionFinder').get(PID);
    assert.ok(summary.colors.includes('black'));
    assert.ok(!summary.colors.includes('olive'), 'edition atoms must NOT be in CEF summary colors');
    assert.ok(!summary.colors.includes('khaki'), 'edition atoms must NOT be in CEF summary colors');
    assert.ok(summary.editions.includes('special-ed'));
    assert.equal(summary.default_color, 'black');
  }));
});

// ── deleteVariant ───────────────────────────────────────────────────

describe('deleteVariant', () => {

  it('removes from variants table', withEnv(({ specDb, root, ensureProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black' },
        { variant_id: 'v_bb', variant_key: 'color:white' },
        { variant_id: 'v_cc', variant_key: 'edition:special-ed' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    const result = deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    assert.equal(result.deleted, true);
    assert.equal(specDb.variants.get(PID, 'v_aa'), null);
    assert.equal(specDb.variants.listByProduct(PID).length, 2);
  }));

  it('removes from JSON SSOT (color_edition.json)', withEnv(({ specDb, root, ensureProductJson, readCefJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black' },
        { variant_id: 'v_bb', variant_key: 'color:white' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    const cef = readCefJson(PID);
    assert.equal(cef.variant_registry.length, 1);
    assert.equal(cef.variant_registry[0].variant_id, 'v_bb');
  }));

  it('re-derives published without deleted variant', withEnv(({ specDb, root, ensureProductJson, readProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa' }, { variant_id: 'v_bb' }, { variant_id: 'v_cc' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    const pj = readProductJson(PID);
    assert.ok(!pj.fields.colors.value.includes('black'), 'deleted variant color removed');
    assert.ok(pj.fields.colors.value.includes('white'), 'other colors preserved');
  }));

  it('cascades to PIF — removes images for deleted variant', withEnv(({ specDb, root, ensureProductJson, ensureCefJson, ensurePifJson, readPifJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa' }, { variant_id: 'v_bb' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });
    ensurePifJson(PID, {
      product_id: PID, category: 'mouse',
      selected: {
        images: [
          { filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' },
          { filename: 'img2.jpg', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' },
        ],
      },
      carousel_slots: { 'color:black': { front: 'img1.jpg' }, 'color:white': { front: 'img2.jpg' } },
      evaluations: [
        { variant_key: 'color:black', variant_id: 'v_aa', type: 'view' },
        { variant_key: 'color:white', variant_id: 'v_bb', type: 'view' },
      ],
      runs: [],
    });

    const result = deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    assert.ok(result.pif.updated);
    const pif = readPifJson(PID);
    assert.equal(pif.selected.images.length, 1, 'only white image remains');
    assert.equal(pif.selected.images[0].variant_id, 'v_bb');
    assert.equal(pif.carousel_slots['color:black'], undefined, 'deleted variant carousel slot removed');
    assert.ok(pif.carousel_slots['color:white'], 'other carousel slot preserved');
    assert.equal(pif.evaluations.length, 1, 'deleted variant eval removed');
  }));

  it('updates selected.* in CEF JSON for rebuild correctness', withEnv(({ specDb, root, ensureProductJson, ensureCefJson, readCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { colors: ['black', 'white', 'olive', 'khaki'], editions: { 'special-ed': { display_name: 'Special Edition' } }, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
        { variant_id: 'v_bb', variant_key: 'color:white', variant_type: 'color', color_atoms: ['white'] },
        { variant_id: 'v_cc', variant_key: 'edition:special-ed', variant_type: 'edition', color_atoms: ['olive', 'khaki'], edition_slug: 'special-ed', edition_display_name: 'Special Edition' },
      ],
      runs: [], run_count: 1, next_run_number: 2,
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    const cef = readCefJson(PID);
    assert.ok(!cef.selected.colors.includes('black'), 'deleted color removed from selected.colors');
    assert.ok(cef.selected.colors.includes('white'), 'other color preserved in selected.colors');
    // WHY: Edition atoms stay scoped to edition — NOT promoted to selected.colors
    assert.ok(!cef.selected.colors.includes('olive'), 'edition atoms must NOT be in selected.colors');
    assert.ok(!cef.selected.colors.includes('khaki'), 'edition atoms must NOT be in selected.colors');
    assert.equal(cef.selected.default_color, 'white', 'default_color updated');
    assert.ok(cef.selected.editions['special-ed'], 'edition preserved in selected.editions');
  }));

  it('strips deleted variant values from field_candidates', withEnv(({ specDb, root, ensureProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
        { variant_id: 'v_bb', variant_key: 'color:white', variant_type: 'color', color_atoms: ['white'] },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    // Seed candidates with arrays containing the variant's color
    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-test-1', sourceType: 'cef',
      value: '["black","white"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });
    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-test-2', sourceType: 'cef',
      value: '["black","white","red"]', confidence: 0.9, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    const remaining = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    // cef-test-1 had ["black","white"] → ["white"] (still has items)
    // cef-test-2 had ["black","white","red"] → ["white","red"] (still has items)
    assert.equal(remaining.length, 2, 'both candidates survive (still have values)');

    const vals = remaining.map(r => JSON.parse(r.value));
    for (const arr of vals) {
      assert.ok(!arr.includes('black'), 'black stripped from candidate');
      assert.ok(arr.includes('white'), 'white preserved in candidate');
    }
  }));

  it('deletes candidate row when all values stripped', withEnv(({ specDb, root, ensureProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: { colors: ['black'], editions: {}, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    // Candidate with only the deleted color
    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-only-black', sourceType: 'cef',
      value: '["black"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    const remaining = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    assert.equal(remaining.length, 0, 'candidate deleted when no values remain');
  }));

  it('strips edition slug from edition candidates on edition variant delete', withEnv(({ specDb, root, ensureProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { colors: ['black', 'olive', 'khaki'], editions: { 'special-ed': { display_name: 'Special Edition' } }, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
        { variant_id: 'v_cc', variant_key: 'edition:special-ed', variant_type: 'edition', color_atoms: ['olive', 'khaki'], edition_slug: 'special-ed' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'editions', sourceId: 'cef-ed-1', sourceType: 'cef',
      value: '["special-ed"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });
    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-col-1', sourceType: 'cef',
      value: '["black","olive","khaki"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    // Delete the edition variant
    deleteVariant({ specDb, productId: PID, variantId: 'v_cc', productRoot: root });

    // Edition candidate should be deleted (only had "special-ed")
    const edCandidates = specDb.getFieldCandidatesByProductAndField(PID, 'editions');
    assert.equal(edCandidates.length, 0, 'edition candidate deleted');

    // Color candidate should have olive+khaki stripped
    const colCandidates = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    assert.equal(colCandidates.length, 1);
    const colVal = JSON.parse(colCandidates[0].value);
    assert.ok(!colVal.includes('olive'), 'edition atom stripped from colors');
    assert.ok(!colVal.includes('khaki'), 'edition atom stripped from colors');
    assert.ok(colVal.includes('black'), 'non-edition color preserved');
  }));

  it('returns deleted false for missing variant', withEnv(({ specDb, root }) => {
    const result = deleteVariant({ specDb, productId: PID, variantId: 'v_nonexistent', productRoot: root });
    assert.equal(result.deleted, false);
  }));
});
