import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { deleteVariant } from '../variantLifecycle.js';

const CATEGORY = 'mouse';
const PRODUCT_ID = 'mouse-cross-finder-cascade';
const TARGET_VARIANT_ID = 'v_black';
const TARGET_VARIANT_KEY = 'color:black';
const KEEP_VARIANT_ID = 'v_white';
const KEEP_VARIANT_KEY = 'color:white';

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function withEnv(fn) {
  return () => {
    const root = path.join('.tmp', `_test_cross_finder_cascade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(root, { recursive: true });
    const specDb = new SpecDb({ dbPath: ':memory:', category: CATEGORY });
    try {
      fn({ root, specDb });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function productPath(root, filename) {
  return path.join(root, PRODUCT_ID, filename);
}

function seedVariants(specDb) {
  specDb.variants.syncFromRegistry(PRODUCT_ID, [
    {
      variant_id: TARGET_VARIANT_ID,
      variant_key: TARGET_VARIANT_KEY,
      variant_type: 'color',
      variant_label: 'Black',
      color_atoms: ['black'],
      created_at: '2026-04-14T00:00:00Z',
    },
    {
      variant_id: KEEP_VARIANT_ID,
      variant_key: KEEP_VARIANT_KEY,
      variant_type: 'color',
      variant_label: 'White',
      color_atoms: ['white'],
      created_at: '2026-04-14T00:00:00Z',
    },
  ]);
}

function seedCefState({ root, specDb }) {
  specDb.getFinderStore('colorEditionFinder').upsert({
    category: CATEGORY,
    product_id: PRODUCT_ID,
    colors: ['black', 'white'],
    editions: [],
    default_color: 'black',
    latest_ran_at: '2026-04-14T00:00:00Z',
    run_count: 1,
  });
  writeJson(productPath(root, 'color_edition.json'), {
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
    variant_registry: [
      { variant_id: TARGET_VARIANT_ID, variant_key: TARGET_VARIANT_KEY, variant_type: 'color', color_atoms: ['black'] },
      { variant_id: KEEP_VARIANT_ID, variant_key: KEEP_VARIANT_KEY, variant_type: 'color', color_atoms: ['white'] },
    ],
    runs: [],
    run_count: 1,
    next_run_number: 2,
  });
}

function seedProductJson(root) {
  writeJson(productPath(root, 'product.json'), {
    schema_version: 2,
    product_id: PRODUCT_ID,
    category: CATEGORY,
    identity: { brand: 'Spec Factory', model: 'Cascade Mouse' },
    sources: [],
    fields: {
      colors: { value: ['black', 'white'], source: 'variant_registry' },
    },
    candidates: {
      release_date: [
        { value: '2026-06-15', source_id: 'rdf-target', source_type: 'release_date_finder', confidence: 95, variant_id: TARGET_VARIANT_ID },
        { value: '2026-07-01', source_id: 'rdf-keep', source_type: 'release_date_finder', confidence: 90, variant_id: KEEP_VARIANT_ID },
      ],
      sku: [
        { value: 'BLACK-SKU', source_id: 'sku-target', source_type: 'sku_finder', confidence: 96, variant_id: TARGET_VARIANT_ID },
        { value: 'WHITE-SKU', source_id: 'sku-keep', source_type: 'sku_finder', confidence: 91, variant_id: KEEP_VARIANT_ID },
      ],
    },
    variant_fields: {
      [TARGET_VARIANT_ID]: {
        release_date: { value: '2026-06-15', source: 'release_date_finder' },
        sku: { value: 'BLACK-SKU', source: 'sku_finder' },
      },
      [KEEP_VARIANT_ID]: {
        release_date: { value: '2026-07-01', source: 'release_date_finder' },
        sku: { value: 'WHITE-SKU', source: 'sku_finder' },
      },
    },
    created_at: '2026-04-14T00:00:00Z',
    updated_at: '2026-04-14T00:00:00Z',
  });
}

function seedPifState({ root, specDb }) {
  specDb.getFinderStore('productImageFinder').upsert({
    category: CATEGORY,
    product_id: PRODUCT_ID,
    images: [
      { filename: 'black-front.jpg', view: 'front', variant_key: TARGET_VARIANT_KEY },
      { filename: 'white-front.jpg', view: 'front', variant_key: KEEP_VARIANT_KEY },
    ],
    image_count: 2,
    carousel_slots: {
      [TARGET_VARIANT_KEY]: { front: 'black-front.jpg' },
      [KEEP_VARIANT_KEY]: { front: 'white-front.jpg' },
    },
    evaluations: [],
    latest_ran_at: '2026-04-14T00:00:00Z',
    run_count: 0,
  });
  specDb.upsertPifVariantProgress({
    productId: PRODUCT_ID,
    variantId: TARGET_VARIANT_ID,
    variantKey: TARGET_VARIANT_KEY,
    priorityFilled: 1,
    priorityTotal: 3,
    loopFilled: 1,
    loopTotal: 3,
    heroFilled: 0,
    heroTarget: 1,
    imageCount: 1,
  });
  specDb.upsertPifVariantProgress({
    productId: PRODUCT_ID,
    variantId: KEEP_VARIANT_ID,
    variantKey: KEEP_VARIANT_KEY,
    priorityFilled: 2,
    priorityTotal: 3,
    loopFilled: 2,
    loopTotal: 3,
    heroFilled: 1,
    heroTarget: 1,
    imageCount: 2,
  });
  writeJson(productPath(root, 'product_images.json'), {
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: {
      images: [
        { filename: 'black-front.jpg', view: 'front', variant_id: TARGET_VARIANT_ID, variant_key: TARGET_VARIANT_KEY },
        { filename: 'white-front.jpg', view: 'front', variant_id: KEEP_VARIANT_ID, variant_key: KEEP_VARIANT_KEY },
      ],
    },
    carousel_slots: {
      [TARGET_VARIANT_KEY]: { front: 'black-front.jpg' },
      [KEEP_VARIANT_KEY]: { front: 'white-front.jpg' },
    },
    evaluations: [],
    runs: [],
    run_count: 0,
    next_run_number: 1,
    last_ran_at: '',
  });
}

function seedScalarFinderState({ root, specDb, moduleId, filePrefix, fieldKey, sourceType, targetValue, keepValue }) {
  const targetCandidate = {
    variant_id: TARGET_VARIANT_ID,
    variant_key: TARGET_VARIANT_KEY,
    value: targetValue,
    confidence: 95,
  };
  const keepCandidate = {
    variant_id: KEEP_VARIANT_ID,
    variant_key: KEEP_VARIANT_KEY,
    value: keepValue,
    confidence: 90,
  };
  writeJson(productPath(root, `${filePrefix}.json`), {
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { candidates: [targetCandidate, keepCandidate] },
    runs: [
      {
        run_number: 1,
        ran_at: '2026-04-14T01:00:00Z',
        model: 'test',
        fallback_used: false,
        selected: { candidates: [targetCandidate] },
        prompt: {},
        response: { variant_id: TARGET_VARIANT_ID, variant_key: TARGET_VARIANT_KEY, candidates: [targetCandidate] },
      },
      {
        run_number: 2,
        ran_at: '2026-04-14T02:00:00Z',
        model: 'test',
        fallback_used: false,
        selected: { candidates: [keepCandidate] },
        prompt: {},
        response: { variant_id: KEEP_VARIANT_ID, variant_key: KEEP_VARIANT_KEY, candidates: [keepCandidate] },
      },
    ],
    run_count: 2,
    next_run_number: 3,
    last_ran_at: '2026-04-14T02:00:00Z',
  });

  const store = specDb.getFinderStore(moduleId);
  store.upsert({
    category: CATEGORY,
    product_id: PRODUCT_ID,
    candidates: [targetCandidate, keepCandidate],
    candidate_count: 2,
    cooldown_until: '',
    latest_ran_at: '2026-04-14T02:00:00Z',
    run_count: 2,
  });
  store.insertRun({
    category: CATEGORY,
    product_id: PRODUCT_ID,
    run_number: 1,
    ran_at: '2026-04-14T01:00:00Z',
    model: 'test',
    fallback_used: false,
    effort_level: '',
    access_mode: '',
    thinking: false,
    web_search: false,
    selected: { candidates: [targetCandidate] },
    prompt: {},
    response: { variant_id: TARGET_VARIANT_ID, variant_key: TARGET_VARIANT_KEY, candidates: [targetCandidate] },
  });
  store.insertRun({
    category: CATEGORY,
    product_id: PRODUCT_ID,
    run_number: 2,
    ran_at: '2026-04-14T02:00:00Z',
    model: 'test',
    fallback_used: false,
    effort_level: '',
    access_mode: '',
    thinking: false,
    web_search: false,
    selected: { candidates: [keepCandidate] },
    prompt: {},
    response: { variant_id: KEEP_VARIANT_ID, variant_key: KEEP_VARIANT_KEY, candidates: [keepCandidate] },
  });

  specDb.insertFieldCandidate({
    productId: PRODUCT_ID,
    fieldKey,
    sourceId: `${sourceType}-target`,
    sourceType,
    value: targetValue,
    confidence: 95,
    model: 'test',
    validationJson: {},
    metadataJson: {},
    variantId: TARGET_VARIANT_ID,
  });
  specDb.insertFieldCandidate({
    productId: PRODUCT_ID,
    fieldKey,
    sourceId: `${sourceType}-keep`,
    sourceType,
    value: keepValue,
    confidence: 90,
    model: 'test',
    validationJson: {},
    metadataJson: {},
    variantId: KEEP_VARIANT_ID,
  });
}

function variantIds(rows) {
  return rows.map((row) => row.variant_id).sort();
}

describe('deleteVariant cross-finder cascade', () => {
  it('removes deleted CEF variant state from PIF progress, RDF, SKU, and product mirrors', withEnv(({ root, specDb }) => {
    seedVariants(specDb);
    seedCefState({ root, specDb });
    seedProductJson(root);
    seedPifState({ root, specDb });
    seedScalarFinderState({
      root,
      specDb,
      moduleId: 'releaseDateFinder',
      filePrefix: 'release_date',
      fieldKey: 'release_date',
      sourceType: 'release_date_finder',
      targetValue: '2026-06-15',
      keepValue: '2026-07-01',
    });
    seedScalarFinderState({
      root,
      specDb,
      moduleId: 'skuFinder',
      filePrefix: 'sku',
      fieldKey: 'sku',
      sourceType: 'sku_finder',
      targetValue: 'BLACK-SKU',
      keepValue: 'WHITE-SKU',
    });

    const result = deleteVariant({
      specDb,
      productId: PRODUCT_ID,
      variantId: TARGET_VARIANT_ID,
      productRoot: root,
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(
      variantIds(specDb.listPifVariantProgressByProduct(PRODUCT_ID)),
      [KEEP_VARIANT_ID],
      'PIF progress projection keeps only surviving variants',
    );
    assert.deepEqual(
      variantIds(specDb.getFieldCandidatesByProductAndField(PRODUCT_ID, 'release_date')),
      [KEEP_VARIANT_ID],
      'RDF field candidates keep only surviving variants',
    );
    assert.deepEqual(
      variantIds(specDb.getFieldCandidatesByProductAndField(PRODUCT_ID, 'sku')),
      [KEEP_VARIANT_ID],
      'SKU field candidates keep only surviving variants',
    );

    for (const [moduleId, filePrefix] of [
      ['releaseDateFinder', 'release_date'],
      ['skuFinder', 'sku'],
    ]) {
      const store = specDb.getFinderStore(moduleId);
      const summary = store.get(PRODUCT_ID);
      assert.deepEqual(variantIds(summary.candidates), [KEEP_VARIANT_ID], `${moduleId} summary stripped`);
      assert.deepEqual(store.listRuns(PRODUCT_ID).map((run) => run.run_number), [2], `${moduleId} target run deleted`);
      const json = readJson(productPath(root, `${filePrefix}.json`));
      assert.deepEqual(variantIds(json.selected.candidates), [KEEP_VARIANT_ID], `${filePrefix}.json aggregate stripped`);
      assert.deepEqual(json.runs.map((run) => run.run_number), [2], `${filePrefix}.json target run deleted`);
    }

    const pifJson = readJson(productPath(root, 'product_images.json'));
    assert.deepEqual(variantIds(pifJson.selected.images), [KEEP_VARIANT_ID], 'PIF JSON selected images stripped');
    assert.equal(pifJson.carousel_slots[TARGET_VARIANT_KEY], undefined, 'PIF carousel slot removed');

    const productJson = readJson(productPath(root, 'product.json'));
    assert.equal(productJson.variant_fields[TARGET_VARIANT_ID], undefined, 'product variant_fields target removed');
    assert.ok(productJson.variant_fields[KEEP_VARIANT_ID], 'product variant_fields survivor preserved');
    assert.deepEqual(variantIds(productJson.candidates.release_date), [KEEP_VARIANT_ID]);
    assert.deepEqual(variantIds(productJson.candidates.sku), [KEEP_VARIANT_ID]);
  }));
});
