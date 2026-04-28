import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogBuilder, createCatalogRowBuilder } from '../catalogHelpers.js';
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
  keyFinderSettings = null,
  compiledFields = null,
  resolvedByPidField = {},
  concreteByPidField = {},
  candidateReads = null,
  projectionReads = null,
} = {}) {
  const pif = pifSettings || {};
  const kfs = keyFinderSettings || {};
  const countRead = (key) => {
    if (!projectionReads) return;
    projectionReads[key] = (projectionReads[key] || 0) + 1;
  };
  const fieldCandidateRowsByCategory = () =>
    Object.entries(candidatesByPid).flatMap(([product_id, rows]) =>
      (rows || []).map((row) => ({ product_id, ...row })));
  const rowsByCategory = (rowsByPid) =>
    Object.entries(rowsByPid || {}).flatMap(([product_id, rows]) =>
      (rows || []).map((row) => ({ product_id, ...row })));
  return {
    getAllProducts: () => products,
    getProduct: (pid) => products.find((row) => row.product_id === pid) || null,
    getAllFieldCandidatesByProduct: (pid) => {
      countRead('allCandidatesByProduct');
      if (candidateReads) candidateReads.push(pid);
      return candidatesByPid[pid] || [];
    },
    getAllFieldCandidatesByCategory: () => {
      countRead('allCandidatesByCategory');
      return fieldCandidateRowsByCategory();
    },
    getFieldCandidatesByProductAndField: (pid, fk, variantId) => {
      countRead('fieldCandidatesByProductAndField');
      const rows = candidatesByPidField[pid]?.[fk] || [];
      if (variantId === undefined) return rows;
      return rows.filter((r) => (r.variant_id ?? null) === (variantId ?? null));
    },
    getFieldKeyOrder: () => (fieldOrderJson == null ? null : { order_json: fieldOrderJson }),
    listColorEditionFinderRuns: (pid) => {
      countRead('cefRunsByProduct');
      return cefRunsByPid[pid] || [];
    },
    listColorEditionFinderRunsByCategory: () => {
      countRead('cefRunsByCategory');
      return rowsByCategory(cefRunsByPid);
    },
    listPifVariantProgressByProduct: (pid) => {
      countRead('pifProgressByProduct');
      return pifProgressByPid[pid] || [];
    },
    listPifVariantProgressByCategory: () => {
      countRead('pifProgressByCategory');
      return rowsByCategory(pifProgressByPid);
    },
    variants: {
      listByProduct: (pid) => {
        countRead('variantsByProduct');
        return variantsByPid[pid] || [];
      },
      listByCategory: () => {
        countRead('variantsByCategory');
        return rowsByCategory(variantsByPid);
      },
    },
    getFinderStore: (moduleId) => {
      if (moduleId === 'productImageFinder') return { getSetting: (key) => pif[key] ?? null };
      if (moduleId === 'keyFinder') return { getSetting: (key) => kfs[key] ?? null };
      return null;
    },
    getCompiledRules: () => (compiledFields ? { fields: compiledFields } : null),
    getResolvedFieldCandidate: (pid, fk) => {
      countRead('resolvedFieldCandidate');
      return Boolean(resolvedByPidField[pid]?.[fk]);
    },
    // isConcreteEvidence routes through evaluateFieldBuckets → listFieldBuckets.
    // For test isolation we stub listFieldBuckets to return one "bucket" per fk
    // with a bucket-value and evidence-count that match the test fixture's
    // concreteByPidField map. Concrete-gate default: conf≥95, evd≥3.
    listFieldBuckets: (pid, fk) => {
      const hit = concreteByPidField[pid]?.[fk];
      if (!hit) return [];
      return [{ fingerprint: 'fp', normalized_value: 'v', raw_count: hit.evidenceCount || 0, top_confidence: hit.confidence || 0 }];
    },
    countPooledQualifyingEvidenceByFingerprint: (pid, fk, _vid, _fp, minConf) => {
      const hit = concreteByPidField[pid]?.[fk];
      if (!hit) return 0;
      const conf = Number(hit.confidence) || 0;
      if (conf < Number(minConf || 0) * 100) return 0;
      return Number(hit.evidenceCount) || 0;
    },
    listFieldBucketsByCategory: () => {
      countRead('fieldBucketsByCategory');
      return Object.entries(concreteByPidField).flatMap(([product_id, fields]) =>
        Object.entries(fields || {}).map(([field_key, hit]) => ({
          product_id,
          field_key,
          variant_id_key: '',
          value_fingerprint: 'fp',
          top_confidence: hit.confidence || 0,
        })));
    },
    listPooledQualifyingEvidenceCountsByCategory: () => {
      countRead('pooledEvidenceCountsByCategory');
      return Object.entries(concreteByPidField).flatMap(([product_id, fields]) =>
        Object.entries(fields || {}).map(([field_key, hit]) => ({
          product_id,
          field_key,
          variant_id_key: '',
          value_fingerprint: 'fp',
          total: hit.evidenceCount || 0,
        })));
    },
  };
}

test('SQL catalog row builder: returns one CatalogRow without reading unrelated product candidates', async () => {
  const candidateReads = [];
  const buildCatalogRow = createCatalogRowBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
        { id: 2, product_id: 'mouse-b', brand: 'Beta', model: 'B', base_model: 'B', variant: '', identifier: 'b', status: 'active' },
      ],
      candidatesByPid: {
        'mouse-b': [
          { field_key: 'dpi_max', status: 'resolved', confidence: 90 },
        ],
      },
      fieldOrderJson: JSON.stringify(['dpi_max', 'sensor_model']),
      candidateReads,
    }),
    cleanVariant,
  });

  const row = await buildCatalogRow('mouse', 'mouse-b');

  assert.equal(row.productId, 'mouse-b');
  assert.equal(row.brand, 'Beta');
  assert.equal(row.fieldsFilled, 1);
  assert.equal(row.fieldsTotal, 2);
  assert.deepEqual(candidateReads, ['mouse-b']);
});

test('SQL catalog row builder: missing product returns null', async () => {
  const candidateReads = [];
  const buildCatalogRow = createCatalogRowBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      candidateReads,
    }),
    cleanVariant,
  });

  const row = await buildCatalogRow('mouse', 'missing-product');

  assert.equal(row, null);
  assert.deepEqual(candidateReads, []);
});

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
    pifDependencyReady: true,
    pifDependencyRequiredKeys: [],
    pifDependencyResolvedKeys: [],
    pifDependencyMissingKeys: [],
    pifVariants: [], // no variants on this product → empty array (different from "variants exist but no PIF run")
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [
      { tier: 'easy',      total: 0, resolved: 0, perfect: 0 },
      { tier: 'medium',    total: 0, resolved: 0, perfect: 0 },
      { tier: 'hard',      total: 0, resolved: 0, perfect: 0 },
      { tier: 'very_hard', total: 0, resolved: 0, perfect: 0 },
      { tier: 'mandatory', total: 0, resolved: 0, perfect: 0 },
    ],
    cefLastRunAt: '',
    pifLastRunAt: '',
    rdfLastRunAt: '',
    skuLastRunAt: '',
    kfLastRunAt: '',
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
          { variant_id: 'v_black', variant_key: 'color:black', priority_filled: 4, priority_total: 4, loop_filled: 2, loop_total: 4, hero_filled: 3, hero_target: 3, image_count: 12 },
          { variant_id: 'v_white', variant_key: 'color:white', priority_filled: 1, priority_total: 4, loop_filled: 0, loop_total: 4, hero_filled: 0, hero_target: 3, image_count: 3 },
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
    image_count: 12,
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
    priority_total: 8,   // scored views fallback to viewBudget when knob is unset
    loop_filled: 0,
    loop_total: 3,       // additional-image target default
    hero_filled: 0,
    hero_target: 3,      // heroCount
    image_count: 0,      // no images collected yet
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

test('SQL catalog builder: full catalog uses category projections instead of per-product point reads', async () => {
  const projectionReads = {};
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
        { id: 2, product_id: 'mouse-b', brand: 'Beta', model: 'B', base_model: 'B', variant: '', identifier: '', status: 'active' },
      ],
      candidatesByPid: {
        'mouse-a': [
          { field_key: 'dpi_max', status: 'resolved', confidence: 90 },
          { field_key: 'sku', variant_id: 'v_black', value: 'A-BLK', status: 'resolved', confidence: 91 },
        ],
        'mouse-b': [
          { field_key: 'dpi_max', status: 'resolved', confidence: 80 },
          { field_key: 'release_date', variant_id: 'v_white', value: '2026-01-01', status: 'resolved', confidence: 92 },
        ],
      },
      fieldOrderJson: JSON.stringify(['dpi_max', 'sku', 'release_date']),
      cefRunsByPid: {
        'mouse-a': [{ run_number: 1 }],
        'mouse-b': [{ run_number: 1 }, { run_number: 2 }],
      },
      pifProgressByPid: {
        'mouse-a': [{ variant_id: 'v_black', variant_key: 'color:black', image_count: 3 }],
        'mouse-b': [{ variant_id: 'v_white', variant_key: 'color:white', image_count: 4 }],
      },
      variantsByPid: {
        'mouse-a': [{ variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', color_atoms: ['black'] }],
        'mouse-b': [{ variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', color_atoms: ['white'] }],
      },
      projectionReads,
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  const byPid = Object.fromEntries(rows.map((row) => [row.productId, row]));

  assert.equal(byPid['mouse-a'].fieldsFilled, 2);
  assert.equal(byPid['mouse-b'].fieldsFilled, 2);
  assert.equal(byPid['mouse-a'].cefRunCount, 1);
  assert.equal(byPid['mouse-b'].cefRunCount, 2);
  assert.equal(byPid['mouse-a'].pifVariants[0].image_count, 3);
  assert.equal(byPid['mouse-b'].rdfVariants[0].value, '2026-01-01');

  assert.equal(projectionReads.allCandidatesByCategory, 1);
  assert.equal(projectionReads.variantsByCategory, 1);
  assert.equal(projectionReads.pifProgressByCategory, 1);
  assert.equal(projectionReads.cefRunsByCategory, 1);
  assert.equal(projectionReads.allCandidatesByProduct || 0, 0);
  assert.equal(projectionReads.fieldCandidatesByProductAndField || 0, 0);
  assert.equal(projectionReads.variantsByProduct || 0, 0);
  assert.equal(projectionReads.pifProgressByProduct || 0, 0);
  assert.equal(projectionReads.cefRunsByProduct || 0, 0);
  assert.equal(projectionReads.resolvedFieldCandidate || 0, 0);
});

test('SQL catalog builder: keyTierProgress buckets fields by difficulty and counts resolved', async () => {
  // Concrete gate disabled (excludeConf=0) so perfect stays at 0 — focused test on
  // bucketing + resolved counting. Concrete-gate integration covered elsewhere.
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      compiledFields: {
        dpi_max:         { difficulty: 'easy',      required_level: 'mandatory' },
        sensor_model:    { difficulty: 'easy',      required_level: 'non_mandatory' },
        weight_g:        { difficulty: 'medium',    required_level: 'non_mandatory' },
        polling_rate_hz: { difficulty: 'medium',    required_level: 'mandatory' },
        lod:             { difficulty: 'hard',      required_level: 'non_mandatory' },
        lift_off_ms:     { difficulty: 'very_hard', required_level: 'mandatory' },
      },
      resolvedByPidField: {
        'mouse-a': { dpi_max: true, weight_g: true, polling_rate_hz: true },
      },
      keyFinderSettings: { passengerExcludeAtConfidence: '0', passengerExcludeMinEvidence: '0' },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  const byTier = Object.fromEntries(rows[0].keyTierProgress.map((t) => [t.tier, t]));

  // easy: 2 keys (dpi_max, sensor_model); resolved dpi_max only
  assert.equal(byTier.easy.total, 2);
  assert.equal(byTier.easy.resolved, 1);
  // medium: 2 keys; 2 resolved
  assert.equal(byTier.medium.total, 2);
  assert.equal(byTier.medium.resolved, 2);
  // hard: 1 key; 0 resolved
  assert.equal(byTier.hard.total, 1);
  assert.equal(byTier.hard.resolved, 0);
  // very_hard: 1 key; 0 resolved
  assert.equal(byTier.very_hard.total, 1);
  assert.equal(byTier.very_hard.resolved, 0);
  // mandatory: 3 keys (dpi_max, polling_rate_hz, lift_off_ms); 2 resolved
  assert.equal(byTier.mandatory.total, 3);
  assert.equal(byTier.mandatory.resolved, 2);

  // Perfect stays 0 with concrete gate off
  for (const t of rows[0].keyTierProgress) assert.equal(t.perfect, 0);
});

test('SQL catalog builder: keyTierProgress excludes reserved field keys (CEF/PIF/RDF/SKF)', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'A', base_model: 'A', variant: '', identifier: '', status: 'active' },
      ],
      compiledFields: {
        colors:         { difficulty: 'medium', required_level: 'mandatory' },   // reserved (CEF)
        editions:       { difficulty: 'medium', required_level: 'mandatory' },   // reserved (CEF)
        release_date:   { difficulty: 'hard',   required_level: 'mandatory' },   // reserved (RDF)
        sku:            { difficulty: 'hard',   required_level: 'mandatory' },   // reserved (SKF)
        real_key:       { difficulty: 'easy',   required_level: 'non_mandatory' },
      },
      resolvedByPidField: {
        'mouse-a': { real_key: true, colors: true }, // colors resolved but excluded from count
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  const byTier = Object.fromEntries(rows[0].keyTierProgress.map((t) => [t.tier, t]));
  // Only `real_key` should count → easy total=1 resolved=1, others zero
  assert.equal(byTier.easy.total, 1);
  assert.equal(byTier.easy.resolved, 1);
  assert.equal(byTier.medium.total, 0);
  assert.equal(byTier.hard.total, 0);
  assert.equal(byTier.mandatory.total, 0);
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
