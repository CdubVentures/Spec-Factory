import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  getComponentValueId,
  makeCategoryAuthorityConfig,
  writeComponentReviewItems,
} from './helpers/componentReviewHarness.js';

test('component payload defaults non-user slot selection to highest-confidence candidate', async () => {
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
      value: '32000',
      confidence: 0.42,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-top-candidate',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'shared_accept',
      matchScore: 1,
    });
    specDb.insertCandidate({
      candidate_id: 'cand_low',
      category: CATEGORY,
      product_id: 'mouse-test-top-candidate',
      field_key: 'dpi_max',
      value: '32000',
      normalized_value: '32000',
      score: 0.42,
      source_host: 'low.example',
      source_tier: 2,
      source_method: 'pipeline_extract',
    });
    specDb.insertCandidate({
      candidate_id: 'cand_high',
      category: CATEGORY,
      product_id: 'mouse-test-top-candidate',
      field_key: 'dpi_max',
      value: '35000',
      normalized_value: '35000',
      score: 0.93,
      source_host: 'high.example',
      source_tier: 1,
      source_method: 'pipeline_extract',
    });

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
    });
    const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3950/PixArt row');
    const prop = row?.properties?.dpi_max;
    assert.ok(prop, 'expected dpi_max property');
    assert.equal(prop.selected.value, '35000');
    assert.equal(String(prop.candidates?.[0]?.candidate_id || '').endsWith('cand_high'), true);
    assert.equal(prop.source, 'specdb');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload keeps candidate evidence visible after shared lane confirm', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3970',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3970',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '35000',
      confidence: 0.9,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3970', 'PixArt');
    const componentValueId = getComponentValueId(specDb, 'sensor', 'PAW3970', 'PixArt', 'dpi_max');
    assert.ok(componentValueId, 'expected component value slot id');
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
      componentValueId,
      selectedValue: '35000',
      selectedCandidateId: null,
      confidenceScore: 0.9,
      aiConfirmSharedStatus: 'confirmed',
      userAcceptSharedStatus: 'accepted',
    });

    await writeComponentReviewItems(tempRoot, [
      {
        review_id: 'rv_confirmed_component_candidate',
        category: CATEGORY,
        component_type: 'sensor',
        field_key: 'sensor',
        raw_query: 'PAW3970',
        matched_component: 'PAW3970',
        match_type: 'exact',
        status: 'confirmed_ai',
        product_id: 'mouse-test-confirmed-component-candidate',
        created_at: '2026-02-18T00:00:00.000Z',
        product_attributes: {
          dpi_max: '36000',
        },
      },
    ]);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
    });
    const row = payload.items.find((item) => item.name === 'PAW3970' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3970/PixArt row');
    const prop = row?.properties?.dpi_max;
    assert.ok(prop, 'expected dpi_max property');
    const values = (prop.candidates || []).map((candidate) => String(candidate.value));
    assert.equal(values.includes('36000'), true);
    assert.equal((prop.candidate_count || 0) >= 1, true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload synthesizes backing candidate for selected non-user value when candidate id is missing', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3395',
      maker: 'PixArt',
      links: [],
      source: 'pipeline',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3395',
      componentMaker: 'PixArt',
      propertyKey: 'dpi_max',
      value: '26000',
      confidence: 0.8,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: 'missing_component_candidate',
      needsReview: true,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-synthetic-candidate',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3395',
      componentMaker: 'PixArt',
      matchType: 'shared_accept',
      matchScore: 1,
    });

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
    });
    const row = payload.items.find((item) => item.name === 'PAW3395' && item.maker === 'PixArt');
    assert.ok(row, 'expected PAW3395/PixArt row');
    const prop = row?.properties?.dpi_max;
    assert.ok(prop, 'expected dpi_max property');
    assert.equal(
      prop.candidates.some((candidate) => candidate.candidate_id === 'missing_component_candidate'),
      true,
    );
    assert.equal(prop.candidate_count >= 1, true);
    assert.equal(prop.selected.value, '26000');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload aggregates candidates from ALL linked products for EVERY slot type', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentType = 'sensor';
    const componentName = 'PAW3950';
    const componentMaker = 'PixArt';
    const propertyKeys = ['dpi_max', 'ips', 'acceleration'];
    const productIds = ['mouse-agg-p1', 'mouse-agg-p2', 'mouse-agg-p3'];

    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: componentName,
      maker: componentMaker,
      links: [],
      source: 'pipeline',
    });

    for (const propKey of propertyKeys) {
      specDb.upsertComponentValue({
        componentType,
        componentName,
        componentMaker,
        propertyKey: propKey,
        value: '1000',
        confidence: 1,
        variancePolicy: null,
        source: 'pipeline',
        acceptedCandidateId: null,
        needsReview: true,
        overridden: false,
        constraints: [],
      });
    }

    for (const productId of productIds) {
      specDb.upsertItemComponentLink({
        productId,
        fieldKey: 'sensor',
        componentType,
        componentName,
        componentMaker,
        matchType: 'exact',
        matchScore: 1,
      });

      specDb.insertCandidate({
        candidate_id: `${productId}::sensor::name_a`,
        category: CATEGORY,
        product_id: productId,
        field_key: 'sensor',
        value: componentName,
        normalized_value: componentName.toLowerCase(),
        score: 0.95,
        rank: 1,
        source_host: 'contract.test',
        source_method: 'pipeline_extract',
        source_tier: 1,
      });
      specDb.insertCandidate({
        candidate_id: `${productId}::sensor::name_b`,
        category: CATEGORY,
        product_id: productId,
        field_key: 'sensor',
        value: componentName,
        normalized_value: componentName.toLowerCase(),
        score: 0.85,
        rank: 2,
        source_host: 'review.test',
        source_method: 'llm_extract',
        source_tier: 2,
      });

      specDb.insertCandidate({
        candidate_id: `${productId}::sensor_brand::maker_a`,
        category: CATEGORY,
        product_id: productId,
        field_key: 'sensor_brand',
        value: componentMaker,
        normalized_value: componentMaker.toLowerCase(),
        score: 0.9,
        rank: 1,
        source_host: 'contract.test',
        source_method: 'pipeline_extract',
        source_tier: 1,
      });
      specDb.insertCandidate({
        candidate_id: `${productId}::sensor_brand::maker_b`,
        category: CATEGORY,
        product_id: productId,
        field_key: 'sensor_brand',
        value: componentMaker,
        normalized_value: componentMaker.toLowerCase(),
        score: 0.8,
        rank: 2,
        source_host: 'review.test',
        source_method: 'llm_extract',
        source_tier: 2,
      });

      for (const propKey of propertyKeys) {
        specDb.insertCandidate({
          candidate_id: `${productId}::${propKey}::prop_a`,
          category: CATEGORY,
          product_id: productId,
          field_key: propKey,
          value: '1000',
          normalized_value: '1000',
          score: 0.88,
          rank: 1,
          source_host: 'contract.test',
          source_method: 'pipeline_extract',
          source_tier: 1,
          is_component_field: true,
          component_type: componentType,
        });
        specDb.insertCandidate({
          candidate_id: `${productId}::${propKey}::prop_b`,
          category: CATEGORY,
          product_id: productId,
          field_key: propKey,
          value: '1000',
          normalized_value: '1000',
          score: 0.75,
          rank: 2,
          source_host: 'review.test',
          source_method: 'llm_extract',
          source_tier: 2,
          is_component_field: true,
          component_type: componentType,
        });
      }
    }

    await writeComponentReviewItems(tempRoot, []);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType,
      specDb,
    });

    const row = payload.items.find((item) => item.name === componentName && item.maker === componentMaker);
    assert.ok(row, 'expected component row');
    assert.equal((row.linked_products || []).length, 3, 'expected 3 linked products');

    assert.equal(row.name_tracked.candidates.length, 6, 'name slot should have 6 candidates (2 per product x 3 products)');
    assert.equal(row.name_tracked.candidate_count, row.name_tracked.candidates.length, 'name candidate_count must match candidates.length');

    assert.equal(row.maker_tracked.candidates.length, 6, 'maker slot should have 6 candidates (2 per product x 3 products)');
    assert.equal(row.maker_tracked.candidate_count, row.maker_tracked.candidates.length, 'maker candidate_count must match candidates.length');

    for (const propKey of propertyKeys) {
      const prop = row.properties?.[propKey];
      assert.ok(prop, `property ${propKey} should exist`);
      assert.equal(prop.candidates.length, 6, `${propKey} should have 6 candidates (2 per product x 3 products)`);
      assert.equal(prop.candidate_count, prop.candidates.length, `${propKey} candidate_count must match candidates.length`);
    }
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('candidate_count equals candidates.length for every slot in component payload', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentType = 'switch';
    const componentName = 'TTC Gold';
    const componentMaker = 'TTC';
    const propertyKey = 'actuation_force';

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
      value: '50',
      confidence: 1,
      variancePolicy: null,
      source: 'pipeline',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      constraints: [],
    });

    specDb.upsertItemComponentLink({
      productId: 'mouse-ttc-1',
      fieldKey: 'switch',
      componentType,
      componentName,
      componentMaker,
      matchType: 'exact',
      matchScore: 1,
    });
    specDb.insertCandidate({
      candidate_id: 'mouse-ttc-1::switch::name',
      category: CATEGORY,
      product_id: 'mouse-ttc-1',
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
      candidate_id: 'mouse-ttc-1::switch_brand::maker',
      category: CATEGORY,
      product_id: 'mouse-ttc-1',
      field_key: 'switch_brand',
      value: componentMaker,
      normalized_value: componentMaker.toLowerCase(),
      score: 0.9,
      rank: 1,
      source_host: 'contract.test',
      source_method: 'pipeline_extract',
      source_tier: 1,
    });
    specDb.insertCandidate({
      candidate_id: 'mouse-ttc-1::actuation_force::value',
      category: CATEGORY,
      product_id: 'mouse-ttc-1',
      field_key: propertyKey,
      value: '50',
      normalized_value: '50',
      score: 0.88,
      rank: 1,
      source_host: 'contract.test',
      source_method: 'pipeline_extract',
      source_tier: 1,
      is_component_field: true,
      component_type: componentType,
    });

    await writeComponentReviewItems(tempRoot, []);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType,
      specDb,
    });

    for (const row of payload.items) {
      assert.equal(
        row.name_tracked.candidate_count,
        row.name_tracked.candidates.length,
        `${row.name}/${row.maker}: name candidate_count (${row.name_tracked.candidate_count}) must match candidates.length (${row.name_tracked.candidates.length})`,
      );
      assert.equal(
        row.maker_tracked.candidate_count,
        row.maker_tracked.candidates.length,
        `${row.name}/${row.maker}: maker candidate_count (${row.maker_tracked.candidate_count}) must match candidates.length (${row.maker_tracked.candidates.length})`,
      );
      for (const [key, prop] of Object.entries(row.properties || {})) {
        assert.equal(
          prop.candidate_count,
          prop.candidates.length,
          `${row.name}/${row.maker}/${key}: candidate_count (${prop.candidate_count}) must match candidates.length (${prop.candidates.length})`,
        );
      }
    }
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
