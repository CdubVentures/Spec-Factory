import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  getComponentIdentityId,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload hydrates __name/__maker accepted_candidate_id from key_review_state', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-test-paw3950',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
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
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');

  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.equal(row.name_tracked.accepted_candidate_id, 'cand_name');
  assert.equal(row.maker_tracked.accepted_candidate_id, 'cand_maker');
});
