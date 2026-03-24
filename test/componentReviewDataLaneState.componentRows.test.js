import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  getComponentIdentityId,
  getComponentValueId,
  makeCategoryAuthorityConfig,
  writeComponentReviewItems,
} from './helpers/componentReviewHarness.js';

test('component payload hydrates __name/__maker accepted_candidate_id from key_review_state', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 1,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-paw3950',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'shared_accept',
      matchScore: 1,
    });

    const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');
    const componentIdentityId = getComponentIdentityId(specDb, 'sensor', 'PAW3950', 'PixArt');
    assert.ok(componentIdentityId, 'expected component identity slot id');
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: '__name',
      componentIdentifier,
      propertyKey: '__name',
      componentIdentityId,
      selectedValue: 'PAW3950',
      selectedCandidateId: 'cand_name',
      confidenceScore: 1,
      aiConfirmSharedStatus: 'confirmed',
      userAcceptSharedStatus: 'accepted',
    });
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: '__maker',
      componentIdentifier,
      propertyKey: '__maker',
      componentIdentityId,
      selectedValue: 'PixArt',
      selectedCandidateId: 'cand_maker',
      confidenceScore: 1,
      aiConfirmSharedStatus: 'confirmed',
      userAcceptSharedStatus: 'accepted',
    });

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
    });
    const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3950/PixArt row');
    assert.equal(row.name_tracked.accepted_candidate_id, 'cand_name');
    assert.equal(row.maker_tracked.accepted_candidate_id, 'cand_maker');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload keeps contract-declared property columns when component values are blank', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 1,
      variancePolicy: 'upper_bound',
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });

    const config = makeCategoryAuthorityConfig(tempRoot);
    const fieldRules = {
      rules: {
        fields: {
          sensor: {
            component: {
              type: 'sensor',
              source: 'component_db.sensor',
              match: {
                property_keys: ['dpi_max', 'ips'],
              },
            },
          },
          dpi_max: {
            variance_policy: 'upper_bound',
            constraints: [],
          },
          ips: {
            variance_policy: 'upper_bound',
            constraints: ['ips <= dpi_max'],
          },
        },
      },
      component_db_sources: {
        sensor: {
          roles: {
            properties: [
              { field_key: 'dpi_max' },
              { field_key: 'ips' },
            ],
          },
        },
      },
    };
    const payload = await buildComponentReviewPayloads({
      config,
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
      fieldRules,
    });

    assert.ok(payload.property_columns.includes('dpi_max'));
    assert.ok(payload.property_columns.includes('ips'));

    const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3950/PixArt row');
    assert.ok(Object.prototype.hasOwnProperty.call(row.properties || {}, 'ips'));
    assert.equal(row.properties.ips.selected.value, null);
    assert.deepEqual(row.properties.ips.constraints, ['ips <= dpi_max']);

    const layout = await buildComponentReviewLayout({
      config,
      category: CATEGORY,
      specDb,
      fieldRules,
    });
    const sensorType = (layout.types || []).find((type) => type.type === 'sensor');
    assert.ok(sensorType, 'expected sensor component type in layout');
    assert.ok((sensorType.property_columns || []).includes('ips'));
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component layout item_count matches visible payload rows', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const config = makeCategoryAuthorityConfig(tempRoot);
    const componentType = 'sensor';

    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType,
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 1,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-layout-visible',
      fieldKey: 'sensor',
      componentType,
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: 'PAW3950 Hidden',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType,
      componentName: 'PAW3950 Hidden',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: null,
      confidence: 0,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });

    const payload = await buildComponentReviewPayloads({
      config,
      category: CATEGORY,
      componentType,
      specDb,
    });
    const layout = await buildComponentReviewLayout({
      config,
      category: CATEGORY,
      specDb,
    });
    const typeRow = (layout.types || []).find((row) => row.type === componentType);

    assert.ok(typeRow, 'expected sensor type in layout');
    assert.equal(Number(typeRow.item_count || 0), (payload.items || []).length);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload does not hydrate queue-only property candidates when linked product candidates drive the slot', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 1,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-paw3950',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'shared_accept',
      matchScore: 1,
    });

    await writeComponentReviewItems(tempRoot, [
      {
        review_id: 'rv_1',
        category: CATEGORY,
        component_type: 'sensor',
        field_key: 'sensor',
        raw_query: 'PAW3950',
        matched_component: 'PAW3950',
        match_type: 'fuzzy_flagged',
        status: 'pending_ai',
        product_id: 'mouse-test-paw3950',
        created_at: '2026-02-18T00:00:00.000Z',
        product_attributes: {
          dpi_max: '26000, 30000',
        },
      },
    ]);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
    });
    const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3950/PixArt row');
    const values = (row?.properties?.dpi_max?.candidates || []).map((candidate) => String(candidate.value));
    assert.equal(values.includes('26000'), false);
    assert.equal(values.includes('30000'), false);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload isolates same-name lanes by maker for linked-product candidate attribution', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentType = 'switch';
    const componentName = 'Omron D2FC-F-7N';
    const makerA = 'Omron';
    const makerB = 'Huano';
    const propertyKey = 'actuation_force';
    const productsA = ['mouse-omron-a1', 'mouse-omron-a2'];
    const productsB = ['mouse-huano-b1', 'mouse-huano-b2'];

    const upsertLane = (maker, value) => {
      specDb.upsertComponentIdentity({
        componentType,
        canonicalName: componentName,
        maker,
        links: [],
        source: 'pipeline',
      });
      specDb.upsertComponentValue({
        componentType,
        componentName,
        componentMaker: maker,
        propertyKey,
        value: String(value),
        confidence: 1,
        variancePolicy: null,
        source: 'pipeline',
        acceptedCandidateId: null,
        needsReview: true,
        overridden: false,
        constraints: [],
      });
    };

    upsertLane(makerA, 55);
    upsertLane(makerB, 65);

    const linkAndSeedCandidates = (productId, maker, forceValue) => {
      specDb.upsertItemComponentLink({
        productId,
        fieldKey: 'switch',
        componentType,
        componentName,
        componentMaker: maker,
        matchType: 'shared_accept',
        matchScore: 1,
      });
      specDb.insertCandidate({
        candidate_id: `${productId}::switch::name`,
        category: CATEGORY,
        product_id: productId,
        field_key: 'switch',
        value: componentName,
        normalized_value: componentName.toLowerCase(),
        score: 0.95,
        rank: 1,
        source_host: 'contract.test',
        source_method: 'pipeline_extract',
        source_tier: 1,
      });
      specDb.insertCandidate({
        candidate_id: `${productId}::switch_brand::maker`,
        category: CATEGORY,
        product_id: productId,
        field_key: 'switch_brand',
        value: maker,
        normalized_value: maker.toLowerCase(),
        score: 0.9,
        rank: 1,
        source_host: 'contract.test',
        source_method: 'pipeline_extract',
        source_tier: 1,
      });
      specDb.insertCandidate({
        candidate_id: `${productId}::${propertyKey}::value`,
        category: CATEGORY,
        product_id: productId,
        field_key: propertyKey,
        value: String(forceValue),
        normalized_value: String(forceValue),
        score: 0.88,
        rank: 1,
        source_host: 'contract.test',
        source_method: 'pipeline_extract',
        source_tier: 1,
      });
    };

    for (const productId of productsA) {
      linkAndSeedCandidates(productId, makerA, 55);
    }
    for (const productId of productsB) {
      linkAndSeedCandidates(productId, makerB, 65);
    }

    await writeComponentReviewItems(tempRoot, [
      {
        review_id: 'rv_switch_omron',
        category: CATEGORY,
        component_type: componentType,
        field_key: 'switch',
        raw_query: componentName,
        matched_component: componentName,
        match_type: 'exact',
        status: 'pending_ai',
        product_id: productsA[0],
        created_at: '2026-02-20T00:00:00.000Z',
        product_attributes: {
          switch_brand: makerA,
          [propertyKey]: '55',
        },
      },
      {
        review_id: 'rv_switch_huano',
        category: CATEGORY,
        component_type: componentType,
        field_key: 'switch',
        raw_query: componentName,
        matched_component: componentName,
        match_type: 'exact',
        status: 'pending_ai',
        product_id: productsB[0],
        created_at: '2026-02-20T00:00:01.000Z',
        product_attributes: {
          switch_brand: makerB,
          [propertyKey]: '65',
        },
      },
    ]);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType,
      specDb,
    });
    const rowA = payload.items.find((item) => item.name === componentName && item.maker === makerA);
    const rowB = payload.items.find((item) => item.name === componentName && item.maker === makerB);

    assert.ok(rowA, 'expected maker A row');
    assert.ok(rowB, 'expected maker B row');
    assert.equal((rowA.linked_products || []).length, 2);
    assert.equal((rowB.linked_products || []).length, 2);

    const makerValuesA = new Set((rowA.maker_tracked?.candidates || []).map((candidate) => String(candidate?.value || '').trim()));
    const makerValuesB = new Set((rowB.maker_tracked?.candidates || []).map((candidate) => String(candidate?.value || '').trim()));
    assert.equal(makerValuesA.has(makerA), true);
    assert.equal(makerValuesA.has(makerB), false);
    assert.equal(makerValuesB.has(makerB), true);
    assert.equal(makerValuesB.has(makerA), false);

    const propCandidatesA = rowA.properties?.[propertyKey]?.candidates || [];
    const propCandidatesB = rowB.properties?.[propertyKey]?.candidates || [];
    assert.equal(propCandidatesA.length, 2);
    assert.equal(propCandidatesB.length, 2);
    assert.equal(propCandidatesA.every((candidate) => String(candidate?.value || '') === '55'), true);
    assert.equal(propCandidatesB.every((candidate) => String(candidate?.value || '') === '65'), true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload keeps a single row per exact component name+maker identity', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentType = 'switch';
    const componentName = 'Omron D2FC-F-7N';
    const componentMaker = 'Omron';
    const propertyKey = 'actuation_force';

    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: componentName,
      maker: componentMaker,
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: componentName,
      maker: componentMaker,
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType,
      componentName,
      componentMaker,
      propertyKey,
      value: '55',
      confidence: 1,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-dup-row-a',
      fieldKey: 'switch',
      componentType,
      componentName,
      componentMaker,
      matchType: 'shared_accept',
      matchScore: 1,
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-dup-row-b',
      fieldKey: 'switch',
      componentType,
      componentName,
      componentMaker,
      matchType: 'shared_accept',
      matchScore: 1,
    });

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType,
      specDb,
    });
    const rows = (payload.items || []).filter(
      (item) => item.name === componentName && item.maker === componentMaker,
    );
    assert.equal(rows.length, 1);
    assert.equal((rows[0]?.linked_products || []).length, 2);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload keeps shared pending when AI lane is still pending even after user accept', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 0.6,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: 'cand_dpi',
      needsReview: true,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-paw3950',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'shared_accept',
      matchScore: 1,
    });

    const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');
    const componentValueId = getComponentValueId(specDb, 'sensor', 'PAW3950', 'PixArt', 'dpi_max');
    assert.ok(componentValueId, 'expected component value slot id');
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
      componentValueId,
      selectedValue: '35000',
      selectedCandidateId: 'cand_dpi',
      confidenceScore: 0.6,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: 'accepted',
    });

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
    });
    const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3950/PixArt row');
    assert.equal(Boolean(row?.properties?.dpi_max?.needs_review), true);
    assert.equal((row?.properties?.dpi_max?.reason_codes || []).includes('pending_ai'), true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
