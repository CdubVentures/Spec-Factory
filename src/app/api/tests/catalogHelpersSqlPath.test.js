import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogBuilder } from '../catalogHelpers.js';
// WHY: Contract tests for the SQL-based catalog builder path.

function cleanVariant(variant) {
  const token = String(variant ?? '').trim().toLowerCase();
  if (token === '' || token === 'unknown' || token === 'n/a') return '';
  return String(variant).trim();
}

function createMockSpecDb({
  products = [],
  candidatesByPid = {},
  candidatesByPidField = {},
  fieldOrderJson = null,
  cefRunsByPid = {},
  pifProgressByPid = {},
  variantsByPid = {},
  pifSettings = null,
} = {}) {
  const settings = pifSettings || {};
  return {
    getAllProducts: () => products,
    getAllFieldCandidatesByProduct: (pid) => candidatesByPid[pid] || [],
    getFieldCandidatesByProductAndField: (pid, fk, variantId) => {
      const rows = candidatesByPidField[pid]?.[fk] || [];
      if (variantId === undefined) return rows;
      return rows.filter((r) => (r.variant_id ?? null) === (variantId ?? null));
    },
    getFieldKeyOrder: () => (fieldOrderJson == null ? null : { order_json: fieldOrderJson }),
    listColorEditionFinderRuns: (pid) => cefRunsByPid[pid] || [],
    listPifVariantProgressByProduct: (pid) => pifProgressByPid[pid] || [],
    variants: {
      listByProduct: (pid) => variantsByPid[pid] || [],
    },
    getFinderStore: (moduleId) => {
      if (moduleId !== 'productImageFinder') return null;
      return { getSetting: (key) => settings[key] ?? null };
    },
  };
}

test('SQL catalog builder: returns CatalogRow[] from SQL products table', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 10, product_id: 'mouse-acme-orbit-x1', brand: 'Acme', model: 'Orbit X1', base_model: 'Orbit X1', variant: '', identifier: 'abc123', status: 'active' },
      ],
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    productId: 'mouse-acme-orbit-x1',
    id: 10,
    identifier: 'abc123',
    brand: 'Acme',
    brand_identifier: '',
    model: 'Orbit X1',
    base_model: 'Orbit X1',
    variant: '',
    status: 'active',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [], // no variants on this product → empty array (different from "variants exist but no PIF run")
    skuVariants: [],
    rdfVariants: [],
  });
});

test('SQL catalog builder: skips products with empty brand or base_model', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-empty', brand: '', model: 'X', base_model: 'X', variant: '', identifier: '', status: 'active' },
        { id: 2, product_id: 'mouse-nobase', brand: 'Acme', model: 'Orbit', base_model: '', variant: '', identifier: '', status: 'active' },
        { id: 3, product_id: 'mouse-good', brand: 'Razer', model: 'Viper', base_model: 'Viper', variant: '', identifier: 'r1', status: 'active' },
      ],
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brand, 'Razer');
});

test('SQL catalog builder: sorts by brand → model → variant', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 2, product_id: 'mouse-z', brand: 'Zowie', model: 'FK2', base_model: 'FK2', variant: '', identifier: '', status: 'active' },
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'Orbit', base_model: 'Orbit', variant: '', identifier: '', status: 'active' },
        { id: 3, product_id: 'mouse-a2', brand: 'Acme', model: 'Orbit Pro', base_model: 'Orbit', variant: 'Pro', identifier: '', status: 'active' },
      ],
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].brand, 'Acme');
  assert.equal(rows[0].variant, '');
  assert.equal(rows[1].brand, 'Acme');
  assert.equal(rows[1].variant, 'Pro');
  assert.equal(rows[2].brand, 'Zowie');
});

test('SQL catalog builder: empty DB returns empty array', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb(),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows, []);
});

test('SQL catalog builder: product status comes from products table', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-new', brand: 'Test', model: 'New', base_model: 'New', variant: '', identifier: '', status: 'active' },
      ],
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].confidence, 0);
});

test('SQL catalog builder: null specDb returns empty array', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => null,
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows, []);
});

test('SQL catalog builder: fieldsTotal parses order_json from field_key_order row', async () => {
  // WHY: getFieldKeyOrder returns { order_json, updated_at } | null. Prior code treated
  // the row as an array and always produced fieldsTotal=0. Regression guard for that bug.
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-x', brand: 'Acme', model: 'X', base_model: 'X', variant: '', identifier: '', status: 'active' },
      ],
      fieldOrderJson: JSON.stringify(['dpi_max', 'sensor_model', 'weight_g']),
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].fieldsTotal, 3);
});

test('SQL catalog builder: pifVariants joins progress rows with variants metadata', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      pifProgressByPid: {
        'mouse-a': [
          { variant_id: 'v_black', variant_key: 'color:black', priority_filled: 4, priority_total: 4, loop_filled: 2, loop_total: 4, hero_filled: 3, hero_target: 3 },
          { variant_id: 'v_white', variant_key: 'color:white', priority_filled: 1, priority_total: 4, loop_filled: 0, loop_total: 4, hero_filled: 0, hero_target: 3 },
        ],
      },
      variantsByPid: {
        'mouse-a': [
          { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', color_atoms: ['black'] },
          { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', color_atoms: ['white'] },
        ],
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].pifVariants.length, 2);
  const black = rows[0].pifVariants.find(v => v.variant_id === 'v_black');
  assert.deepEqual(black, {
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
    color_atoms: ['black'],
    priority_filled: 4,
    priority_total: 4,
    loop_filled: 2,
    loop_total: 4,
    hero_filled: 3,
    hero_target: 3,
  });
});

test('SQL catalog builder: pifVariants emits empty-rings row per variant when no progress exists', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      variantsByPid: {
        'mouse-a': [
          { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', color_atoms: ['black'] },
        ],
      },
      pifSettings: {
        viewConfig: JSON.stringify([
          { key: 'top', priority: true }, { key: 'left', priority: true },
          { key: 'angle', priority: true }, { key: 'sangle', priority: true },
          { key: 'bottom', priority: false }, { key: 'right', priority: false },
          { key: 'front', priority: false }, { key: 'rear', priority: false },
        ]),
        viewBudget: JSON.stringify(['top', 'left', 'angle', 'sangle', 'bottom', 'right', 'front', 'rear']),
        heroEnabled: 'true',
        heroCount: '3',
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].pifVariants.length, 1);
  assert.deepEqual(rows[0].pifVariants[0], {
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
    color_atoms: ['black'],
    priority_filled: 0,
    priority_total: 4,   // 4 priority views
    loop_filled: 0,
    loop_total: 4,       // 4 loop extras (budget 8 - priority 4)
    hero_filled: 0,
    hero_target: 3,      // heroCount
  });
});

test('SQL catalog builder: skuVariants picks highest-confidence candidate per variant', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      variantsByPid: {
        'mouse-a': [
          { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', color_atoms: ['black'] },
          { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', color_atoms: ['white'] },
        ],
      },
      candidatesByPidField: {
        'mouse-a': {
          sku: [
            { variant_id: 'v_black', field_key: 'sku', value: '910-111', confidence: 72, status: 'candidate' },
            { variant_id: 'v_black', field_key: 'sku', value: '910-111', confidence: 94, status: 'resolved' },
            { variant_id: 'v_white', field_key: 'sku', value: '910-222', confidence: 88, status: 'resolved' },
          ],
        },
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].skuVariants.length, 2);
  const black = rows[0].skuVariants.find(v => v.variant_id === 'v_black');
  const white = rows[0].skuVariants.find(v => v.variant_id === 'v_white');
  assert.equal(black.value, '910-111');
  assert.equal(black.confidence, 94);
  assert.equal(white.value, '910-222');
  assert.equal(white.confidence, 88);
});

test('SQL catalog builder: rdfVariants emits empty-diamond row when no candidate exists', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      variantsByPid: {
        'mouse-a': [
          { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', color_atoms: ['black'] },
        ],
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].rdfVariants.length, 1);
  assert.deepEqual(rows[0].rdfVariants[0], {
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
    color_atoms: ['black'],
    value: '',
    confidence: 0,
  });
});

test('SQL catalog builder: pifVariants is empty array when product has no variants', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows[0].pifVariants, []);
});

test('SQL catalog builder: cefRunCount reflects listColorEditionFinderRuns length', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
        { id: 2, product_id: 'mouse-b', brand: 'Acme', model: 'B', base_model: 'B', variant: '', identifier: '', status: 'active' },
        { id: 3, product_id: 'mouse-c', brand: 'Acme', model: 'C', base_model: 'C', variant: '', identifier: '', status: 'active' },
      ],
      cefRunsByPid: {
        'mouse-a': [],
        'mouse-b': [{ run_number: 1 }],
        'mouse-c': [{ run_number: 1 }, { run_number: 2 }, { run_number: 3 }],
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  const byPid = Object.fromEntries(rows.map((r) => [r.productId, r]));
  assert.equal(byPid['mouse-a'].cefRunCount, 0);
  assert.equal(byPid['mouse-b'].cefRunCount, 1);
  assert.equal(byPid['mouse-c'].cefRunCount, 3);
});

test('SQL catalog builder: confidence averages resolved candidates scaled 0-100 → 0-1', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-y', brand: 'Acme', model: 'Y', base_model: 'Y', variant: '', identifier: '', status: 'active' },
      ],
      candidatesByPid: {
        'mouse-y': [
          { field_key: 'dpi_max', status: 'resolved', confidence: 100 },
          { field_key: 'sensor_model', status: 'resolved', confidence: 80 },
          { field_key: 'weight_g', status: 'candidate', confidence: 50 }, // ignored
        ],
      },
      fieldOrderJson: JSON.stringify(['dpi_max', 'sensor_model', 'weight_g', 'polling_rate_hz']),
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].confidence, 0.9); // (100 + 80) / 2 / 100
  assert.equal(rows[0].fieldsFilled, 2);
  assert.equal(rows[0].fieldsTotal, 4);
  assert.equal(rows[0].coverage, 0.5); // 2 / 4
});
