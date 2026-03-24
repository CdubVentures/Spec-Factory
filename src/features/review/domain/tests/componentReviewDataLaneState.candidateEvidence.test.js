import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  getComponentValueId,
  upsertComponentLane,
  writeComponentReviewItems,
} from './helpers/componentReviewRowHarness.js';

test('component payload keeps candidate evidence visible after shared lane confirm', async (t) => {
  const { config, tempRoot, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3970',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    confidence: 0.9,
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
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3970' && item.maker === 'PixArt');
  const prop = row?.properties?.dpi_max;
  const values = (prop?.candidates || []).map((candidate) => String(candidate.value));

  assert.ok(row, 'expected PAW3970/PixArt row');
  assert.ok(prop, 'expected dpi_max property');
  assert.equal(values.includes('36000'), true);
  assert.equal((prop.candidate_count || 0) >= 1, true);
});
