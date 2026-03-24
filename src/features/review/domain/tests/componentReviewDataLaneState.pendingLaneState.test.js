import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  getComponentValueId,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload keeps shared pending when AI lane is still pending even after user accept', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    confidence: 0.6,
    acceptedCandidateId: 'cand_dpi',
    needsReview: true,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-test-paw3950',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
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
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');

  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.equal(Boolean(row?.properties?.dpi_max?.needs_review), true);
  assert.equal((row?.properties?.dpi_max?.reason_codes || []).includes('pending_ai'), true);
});
