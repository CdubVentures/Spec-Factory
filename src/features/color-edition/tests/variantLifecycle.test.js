import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { derivePublishedFromVariants, deleteVariant, deleteAllVariants, deriveColorNamesFromVariants } from '../variantLifecycle.js';

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

  it('multi-atom color variant publishes combo string, not individual atoms', withEnv(({ specDb, root, ensureProductJson }) => {
    specDb.variants.syncFromRegistry(PID, [
      { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
      { variant_id: 'v_ws', variant_key: 'color:white+silver', variant_type: 'color', variant_label: 'Frost White', color_atoms: ['white', 'silver'], created_at: '2026-04-14T00:00:00Z' },
    ]);
    seedCefSummary(specDb);
    ensureProductJson(PID);

    const result = derivePublishedFromVariants({ specDb, productId: PID, productRoot: root });

    assert.ok(result.colors.includes('black'), 'single atom preserved');
    assert.ok(result.colors.includes('white+silver'), 'combo string preserved as-is');
    assert.ok(!result.colors.includes('white'), 'individual atom "white" must NOT appear');
    assert.ok(!result.colors.includes('silver'), 'individual atom "silver" must NOT appear');
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

// ── deriveColorNamesFromVariants (pure function) ───────────────────

describe('deriveColorNamesFromVariants', () => {

  it('maps color combo to variant_label for published colors', () => {
    const variants = [
      { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: 'Black' },
      { variant_type: 'color', variant_key: 'color:white', color_atoms: ['white'], variant_label: 'White' },
    ];
    const { colorNames } = deriveColorNamesFromVariants(variants, ['black', 'white'], []);
    assert.deepEqual(colorNames, { black: 'Black', white: 'White' });
  });

  it('skips colors not in publishedColors', () => {
    const variants = [
      { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: 'Black' },
      { variant_type: 'color', variant_key: 'color:red', color_atoms: ['red'], variant_label: 'Red' },
    ];
    const { colorNames } = deriveColorNamesFromVariants(variants, ['black'], []);
    assert.deepEqual(colorNames, { black: 'Black' });
  });

  it('skips colors with no variant_label', () => {
    const variants = [
      { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: '' },
      { variant_type: 'color', variant_key: 'color:white', color_atoms: ['white'], variant_label: 'White' },
    ];
    const { colorNames } = deriveColorNamesFromVariants(variants, ['black', 'white'], []);
    assert.deepEqual(colorNames, { white: 'White' });
  });

  it('maps edition slugs to { display_name, colors } with combo string', () => {
    const variants = [
      { variant_type: 'edition', edition_slug: 'special-ed', edition_display_name: 'Special Edition', color_atoms: ['olive', 'khaki'] },
    ];
    const { editionDetails } = deriveColorNamesFromVariants(variants, [], ['special-ed']);
    // WHY: color_atoms are re-joined into combo string to match selected.editions format
    assert.deepEqual(editionDetails, {
      'special-ed': { display_name: 'Special Edition', colors: ['olive+khaki'] },
    });
  });

  it('falls back to edition_slug when no display_name', () => {
    const variants = [
      { variant_type: 'edition', edition_slug: 'limited-ed', edition_display_name: '', color_atoms: ['red'] },
    ];
    const { editionDetails } = deriveColorNamesFromVariants(variants, [], ['limited-ed']);
    assert.deepEqual(editionDetails, {
      'limited-ed': { display_name: 'limited-ed', colors: ['red'] },
    });
  });

  it('skips edition slugs not in publishedEditions', () => {
    const variants = [
      { variant_type: 'edition', edition_slug: 'special-ed', edition_display_name: 'Special', color_atoms: ['olive'] },
    ];
    const { editionDetails } = deriveColorNamesFromVariants(variants, [], []);
    assert.deepEqual(editionDetails, {});
  });

  it('empty variants → empty colorNames and editionDetails', () => {
    const { colorNames, editionDetails } = deriveColorNamesFromVariants([], [], []);
    assert.deepEqual(colorNames, {});
    assert.deepEqual(editionDetails, {});
  });

  it('mixed color + edition variants', () => {
    const variants = [
      { variant_type: 'color', variant_key: 'color:black', color_atoms: ['black'], variant_label: 'Black' },
      { variant_type: 'edition', edition_slug: 'special-ed', edition_display_name: 'Special Edition', color_atoms: ['olive', 'khaki'] },
    ];
    const { colorNames, editionDetails } = deriveColorNamesFromVariants(variants, ['black'], ['special-ed']);
    assert.deepEqual(colorNames, { black: 'Black' });
    assert.deepEqual(editionDetails, {
      'special-ed': { display_name: 'Special Edition', colors: ['olive+khaki'] },
    });
  });
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

  it('deletes PIF image files from disk for deleted variant', withEnv(({ specDb, root, ensureProductJson, ensureCefJson, ensurePifJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa' }, { variant_id: 'v_bb' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    // Create actual image files on disk
    const imagesDir = path.join(root, PID, 'images');
    const originalsDir = path.join(imagesDir, 'originals');
    fs.mkdirSync(originalsDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, 'black-front-1.png'), 'fake');
    fs.writeFileSync(path.join(originalsDir, 'black-front-1-orig.png'), 'fake');
    fs.writeFileSync(path.join(imagesDir, 'white-front-1.png'), 'fake');
    fs.writeFileSync(path.join(originalsDir, 'white-front-1-orig.png'), 'fake');

    ensurePifJson(PID, {
      product_id: PID, category: 'mouse',
      selected: {
        images: [
          { filename: 'black-front-1.png', original_filename: 'black-front-1-orig.png', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' },
          { filename: 'white-front-1.png', original_filename: 'white-front-1-orig.png', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' },
        ],
      },
      carousel_slots: {}, evaluations: [],
      runs: [
        {
          run_number: 1, ran_at: '2026-04-14T00:00:00Z', model: 'test',
          selected: { images: [{ filename: 'black-front-1.png', original_filename: 'black-front-1-orig.png', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' }] },
          response: { variant_key: 'color:black', variant_id: 'v_aa', images: [] },
        },
        {
          run_number: 2, ran_at: '2026-04-14T01:00:00Z', model: 'test',
          selected: { images: [{ filename: 'white-front-1.png', original_filename: 'white-front-1-orig.png', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' }] },
          response: { variant_key: 'color:white', variant_id: 'v_bb', images: [] },
        },
      ],
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    // Deleted variant's image files removed from disk
    assert.ok(!fs.existsSync(path.join(imagesDir, 'black-front-1.png')), 'deleted variant image unlinked');
    assert.ok(!fs.existsSync(path.join(originalsDir, 'black-front-1-orig.png')), 'deleted variant original unlinked');
    // Surviving variant's image files preserved
    assert.ok(fs.existsSync(path.join(imagesDir, 'white-front-1.png')), 'surviving variant image preserved');
    assert.ok(fs.existsSync(path.join(originalsDir, 'white-front-1-orig.png')), 'surviving variant original preserved');
  }));

  it('deletes PIF runs belonging to deleted variant', withEnv(({ specDb, root, ensureProductJson, ensureCefJson, ensurePifJson, readPifJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa' }, { variant_id: 'v_bb' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    // Seed PIF with 2 runs for different variants
    const pifStore = specDb.getFinderStore('productImageFinder');
    pifStore.upsert({
      category: 'mouse', product_id: PID,
      images: [], image_count: 2,
      latest_ran_at: '2026-04-14T01:00:00Z', run_count: 2,
    });
    pifStore.insertRun({ category: 'mouse', product_id: PID, run_number: 1, ran_at: '2026-04-14T00:00:00Z', model: 'test', selected: {}, prompt: {}, response: {} });
    pifStore.insertRun({ category: 'mouse', product_id: PID, run_number: 2, ran_at: '2026-04-14T01:00:00Z', model: 'test', selected: {}, prompt: {}, response: {} });

    ensurePifJson(PID, {
      product_id: PID, category: 'mouse',
      selected: {
        images: [
          { filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' },
          { filename: 'img2.jpg', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' },
        ],
      },
      carousel_slots: { 'color:black': { front: 'img1.jpg' }, 'color:white': { front: 'img2.jpg' } },
      evaluations: [],
      run_count: 2, next_run_number: 3,
      runs: [
        {
          run_number: 1, ran_at: '2026-04-14T00:00:00Z', model: 'test',
          selected: { images: [{ filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' }] },
          response: { variant_key: 'color:black', variant_id: 'v_aa', images: [{ filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' }] },
        },
        {
          run_number: 2, ran_at: '2026-04-14T01:00:00Z', model: 'test',
          selected: { images: [{ filename: 'img2.jpg', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' }] },
          response: { variant_key: 'color:white', variant_id: 'v_bb', images: [{ filename: 'img2.jpg', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' }] },
        },
      ],
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    // JSON: only run 2 remains
    const pif = readPifJson(PID);
    assert.equal(pif.runs.length, 1, 'only non-deleted variant run remains');
    assert.equal(pif.runs[0].run_number, 2, 'run 2 (white) survives');
    assert.equal(pif.run_count, 1, 'run_count recalculated');
    assert.equal(pif.next_run_number, 3, 'next_run_number preserved (monotonic)');
    assert.equal(pif.last_ran_at, '2026-04-14T01:00:00Z', 'last_ran_at from remaining run');

    // SQL: run 1 deleted, bookkeeping updated
    const sqlRuns = pifStore.listRuns(PID);
    assert.equal(sqlRuns.length, 1, 'SQL run 1 deleted');
    const summary = pifStore.get(PID);
    assert.equal(summary.run_count, 1, 'SQL run_count updated');
  }));

  it('deletes legacy PIF run with empty images after stripping', withEnv(({ specDb, root, ensureProductJson, ensureCefJson, ensurePifJson, readPifJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: {}, variant_registry: [
        { variant_id: 'v_aa' },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    // WHY: Legacy run has no response.variant_key or response.variant_id
    ensurePifJson(PID, {
      product_id: PID, category: 'mouse',
      selected: {
        images: [{ filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' }],
      },
      carousel_slots: { 'color:black': { front: 'img1.jpg' } },
      evaluations: [],
      run_count: 1, next_run_number: 2,
      runs: [
        {
          run_number: 1, ran_at: '2026-04-14T00:00:00Z', model: 'test',
          selected: { images: [{ filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' }] },
          response: { images: [{ filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' }] },
        },
      ],
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_aa', productRoot: root });

    const pif = readPifJson(PID);
    assert.equal(pif.runs.length, 0, 'legacy empty-shell run deleted');
    assert.equal(pif.run_count, 0, 'run_count zeroed');
    assert.equal(pif.next_run_number, 2, 'next_run_number preserved');
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

  it('CEF JSON selected.colors preserves combo strings for surviving variants', withEnv(({ specDb, root, ensureProductJson, ensureCefJson, readCefJson }) => {
    // WHY: removeVariantFromJson must use combo strings (from variant_key) not split
    // atoms (from color_atoms) for surviving variants. selected.colors must match
    // derivePublishedFromVariants output so rebuild produces correct state.
    specDb.variants.syncFromRegistry(PID, [
      { variant_id: 'v_ws', variant_key: 'color:white+silver', variant_type: 'color', variant_label: 'Frost White', color_atoms: ['white', 'silver'], created_at: '2026-04-14T00:00:00Z' },
      { variant_id: 'v_dgb', variant_key: 'color:dark-gray+black', variant_type: 'color', variant_label: 'Storm', color_atoms: ['dark-gray', 'black'], created_at: '2026-04-14T00:00:00Z' },
    ]);
    seedCefSummary(specDb);
    ensureProductJson(PID);
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { colors: ['white+silver', 'dark-gray+black'], editions: {}, default_color: 'white+silver' },
      variant_registry: [
        { variant_id: 'v_ws', variant_key: 'color:white+silver', variant_type: 'color', color_atoms: ['white', 'silver'] },
        { variant_id: 'v_dgb', variant_key: 'color:dark-gray+black', variant_type: 'color', color_atoms: ['dark-gray', 'black'] },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_ws', productRoot: root });

    const cef = readCefJson(PID);
    // Surviving variant must appear as combo string, not split atoms
    assert.ok(cef.selected.colors.includes('dark-gray+black'), 'surviving combo preserved as combo string');
    assert.ok(!cef.selected.colors.includes('dark-gray'), 'individual atom "dark-gray" must NOT appear');
    assert.ok(!cef.selected.colors.includes('black'), 'individual atom "black" must NOT appear');
    // Deleted variant gone
    assert.ok(!cef.selected.colors.includes('white+silver'), 'deleted combo removed');
    assert.ok(!cef.selected.colors.includes('white'), 'deleted atom "white" not present');
    assert.ok(!cef.selected.colors.includes('silver'), 'deleted atom "silver" not present');
    assert.equal(cef.selected.default_color, 'dark-gray+black', 'default_color updated to surviving combo');
  }));

  it('strips combo color value from candidates (not individual atoms)', withEnv(({ specDb, root, ensureProductJson, readProductJson, ensureCefJson }) => {
    // WHY: Combo variants like color:white+silver store ["white+silver"] in candidates,
    // NOT split atoms ["white","silver"]. The strip must match the combo string.
    specDb.variants.syncFromRegistry(PID, [
      { variant_id: 'v_ws', variant_key: 'color:white+silver', variant_type: 'color', variant_label: 'Frost White', color_atoms: ['white', 'silver'], created_at: '2026-04-14T00:00:00Z' },
      { variant_id: 'v_bk', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
    ]);
    seedCefSummary(specDb);
    ensureProductJson(PID, {
      candidates: {
        colors: [
          { value: ['white+silver', 'black'], source_id: 'cef-test-1', source_type: 'cef', confidence: 0.95 },
        ],
      },
    });
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { colors: ['white+silver', 'black'], editions: {}, default_color: 'white+silver' },
      variant_registry: [
        { variant_id: 'v_ws', variant_key: 'color:white+silver', variant_type: 'color', color_atoms: ['white', 'silver'] },
        { variant_id: 'v_bk', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-test-1', sourceType: 'cef',
      value: '["white+silver","black"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_ws', productRoot: root });

    // SQL: combo value stripped, black preserved
    const remaining = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    assert.equal(remaining.length, 1, 'candidate survives with remaining value');
    const vals = JSON.parse(remaining[0].value);
    assert.ok(!vals.includes('white+silver'), 'combo "white+silver" stripped from SQL candidate');
    assert.ok(vals.includes('black'), 'black preserved in SQL candidate');

    // JSON: same
    const pj = readProductJson(PID);
    const jsonVals = Array.isArray(pj.candidates.colors[0].value)
      ? pj.candidates.colors[0].value
      : JSON.parse(pj.candidates.colors[0].value);
    assert.ok(!jsonVals.includes('white+silver'), 'combo "white+silver" stripped from JSON candidate');
    assert.ok(jsonVals.includes('black'), 'black preserved in JSON candidate');
  }));

  it('only strips from CEF-sourced candidates, leaves other sources untouched', withEnv(({ specDb, root, ensureProductJson, readProductJson, ensureCefJson }) => {
    // WHY: A non-CEF source (pipeline, feature) may independently discover the same
    // color value. Variant deletion should only strip from source_type=cef rows.
    specDb.variants.syncFromRegistry(PID, [
      { variant_id: 'v_bk', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
    ]);
    seedCefSummary(specDb);
    ensureProductJson(PID, {
      candidates: {
        colors: [
          { value: ['black'], source_id: 'cef-test-1', source_type: 'cef', confidence: 0.95 },
          { value: ['black'], source_id: 'pipeline-test-1', source_type: 'pipeline', confidence: 0.8 },
        ],
      },
    });
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { colors: ['black'], editions: {}, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_bk', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-test-1', sourceType: 'cef',
      value: '["black"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });
    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'pipeline-test-1', sourceType: 'pipeline',
      value: '["black"]', confidence: 0.8, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    deleteVariant({ specDb, productId: PID, variantId: 'v_bk', productRoot: root });

    // SQL: CEF candidate deleted, pipeline candidate untouched
    const remaining = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    assert.equal(remaining.length, 1, 'one candidate survives');
    assert.equal(remaining[0].source_type, 'pipeline', 'pipeline candidate untouched');
    assert.equal(remaining[0].source_id, 'pipeline-test-1');
    const vals = JSON.parse(remaining[0].value);
    assert.deepEqual(vals, ['black'], 'pipeline candidate value intact');

    // JSON: same — pipeline entry survives
    const pj = readProductJson(PID);
    assert.equal(pj.candidates.colors.length, 1, 'one JSON candidate survives');
    assert.equal(pj.candidates.colors[0].source_type, 'pipeline');
  }));

  it('strips deleted variant values from field_candidates', withEnv(({ specDb, root, ensureProductJson, readProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    // WHY: Seed product.json.candidates to verify JSON is also stripped (not just SQL)
    ensureProductJson(PID, {
      candidates: {
        colors: [
          { value: ['black', 'white'], source_id: 'cef-test-1', source_type: 'cef', confidence: 0.95 },
          { value: '["black","white","red"]', source_id: 'cef-test-2', source_type: 'cef', confidence: 0.9 },
        ],
      },
    });
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse', selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
        { variant_id: 'v_bb', variant_key: 'color:white', variant_type: 'color', color_atoms: ['white'] },
      ], runs: [], run_count: 1, next_run_number: 2,
    });

    // Seed SQL candidates with arrays containing the variant's color
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

    // SQL assertions (existing)
    const remaining = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    assert.equal(remaining.length, 2, 'both candidates survive (still have values)');
    const vals = remaining.map(r => JSON.parse(r.value));
    for (const arr of vals) {
      assert.ok(!arr.includes('black'), 'black stripped from SQL candidate');
      assert.ok(arr.includes('white'), 'white preserved in SQL candidate');
    }

    // product.json.candidates assertions (new — Gap 1)
    const pj = readProductJson(PID);
    assert.equal(pj.candidates.colors.length, 2, 'both JSON candidate entries survive');
    for (const entry of pj.candidates.colors) {
      const v = Array.isArray(entry.value) ? entry.value : JSON.parse(entry.value);
      assert.ok(!v.includes('black'), 'black stripped from product.json candidate');
      assert.ok(v.includes('white'), 'white preserved in product.json candidate');
    }
  }));

  it('deletes candidate row when all values stripped', withEnv(({ specDb, root, ensureProductJson, readProductJson, ensureCefJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID, {
      candidates: {
        colors: [
          { value: ['black'], source_id: 'cef-only-black', source_type: 'cef', confidence: 0.95 },
        ],
      },
    });
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

    // SQL assertion (existing)
    const remaining = specDb.getFieldCandidatesByProductAndField(PID, 'colors');
    assert.equal(remaining.length, 0, 'SQL candidate deleted when no values remain');

    // product.json.candidates assertion (new — Gap 1)
    const pj = readProductJson(PID);
    const jsonColors = pj.candidates?.colors;
    assert.ok(!jsonColors || jsonColors.length === 0, 'JSON candidate entry removed when all values stripped');
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

describe('deleteAllVariants', () => {
  it('deletes all active variants and cascades fully', withEnv(({ specDb, root, ensureProductJson, readProductJson, ensureCefJson, readCefJson, ensurePifJson, readPifJson }) => {
    seedVariants(specDb);
    seedCefSummary(specDb);
    ensureProductJson(PID, {
      candidates: {
        colors: [{ value: ['black', 'white'], source_id: 'cef-test-1', source_type: 'cef', confidence: 0.95 }],
      },
    });
    ensureCefJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { colors: ['black', 'white'], editions: { 'special-ed': {} }, default_color: 'black' },
      variant_registry: [
        { variant_id: 'v_aa', variant_key: 'color:black', variant_type: 'color', color_atoms: ['black'] },
        { variant_id: 'v_bb', variant_key: 'color:white', variant_type: 'color', color_atoms: ['white'] },
        { variant_id: 'v_cc', variant_key: 'edition:special-ed', variant_type: 'edition', color_atoms: ['olive', 'khaki'], edition_slug: 'special-ed' },
      ],
      runs: [], run_count: 1, next_run_number: 2,
    });

    // Seed SQL candidates
    specDb.insertFieldCandidate({
      productId: PID, fieldKey: 'colors', sourceId: 'cef-test-1', sourceType: 'cef',
      value: '["black","white"]', confidence: 0.95, model: 'test',
      validationJson: {}, metadataJson: {},
    });

    ensurePifJson(PID, {
      product_id: PID, category: 'mouse',
      selected: { images: [
        { filename: 'img1.jpg', view: 'front', variant_id: 'v_aa', variant_key: 'color:black' },
        { filename: 'img2.jpg', view: 'front', variant_id: 'v_bb', variant_key: 'color:white' },
      ] },
      carousel_slots: { 'color:black': {}, 'color:white': {} },
      evaluations: [], runs: [],
    });

    const result = deleteAllVariants({ specDb, productId: PID, productRoot: root });

    assert.equal(result.deleted, 3, 'all 3 variants deleted');
    assert.equal(result.variants.length, 3);

    // All variants gone from SQL
    assert.equal(specDb.variants.listActive(PID).length, 0);

    // Published state cleared
    const pj = readProductJson(PID);
    assert.equal(pj.fields.colors, undefined, 'colors field cleared');
    assert.equal(pj.fields.editions, undefined, 'editions field cleared');

    // CEF JSON variant_registry empty
    const cef = readCefJson(PID);
    assert.equal(cef.variant_registry.length, 0);

    // PIF images cleared
    const pif = readPifJson(PID);
    assert.equal(pif.selected.images.length, 0);

    // SQL candidates stripped (all values came from these variants)
    assert.equal(specDb.getFieldCandidatesByProductAndField(PID, 'colors').length, 0);
  }));

  it('returns deleted 0 when no variants exist', withEnv(({ specDb, root }) => {
    const result = deleteAllVariants({ specDb, productId: PID, productRoot: root });
    assert.equal(result.deleted, 0);
    assert.deepEqual(result.variants, []);
  }));
});
